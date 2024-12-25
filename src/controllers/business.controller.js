// Import dependencies 📦
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { Subscription } = require('../models/subscription.model');

// Get business profile 🏢
const getBusinessProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const business = await User.findOne({ 
      _id: userId, 
      role: 'business' 
    }).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found! 🔍'
      });
    }

    // Get subscription status
    const subscription = await Subscription.findOne({ 
      businessId: userId,
      status: 'active'
    }).select('plan status billing.currentPeriodEnd');

    res.json({
      success: true,
      data: {
        ...business.toJSON(),
        subscription: subscription || null
      }
    });
  } catch (error) {
    console.error('Get business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business profile! Please try again later 😢'
    });
  }
};

// Update business profile ✏️
const updateBusinessProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.password;
    delete updates.email;
    delete updates.role;
    delete updates.isVerified;
    delete updates.verificationToken;
    delete updates.resetPasswordToken;
    delete updates.resetPasswordExpires;

    const business = await User.findOneAndUpdate(
      { _id: userId, role: 'business' },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Business profile updated successfully! 🎉',
      data: business
    });
  } catch (error) {
    console.error('Update business profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business profile! Please try again later 😢'
    });
  }
};

// List customers 👥
const listCustomers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { page = 1, limit = 10, search } = req.query;

    const query = {
      'transactions.businessId': businessId
    };

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    // Get customers who have transactions with this business
    const customers = await User.aggregate([
      {
        $lookup: {
          from: 'transactions',
          localField: '_id',
          foreignField: 'userId',
          as: 'transactions'
        }
      },
      {
        $match: query
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          lastVisit: { $max: '$transactions.createdAt' },
          totalSpent: { $sum: '$transactions.amount' },
          visitsCount: { $size: '$transactions' }
        }
      },
      {
        $sort: { lastVisit: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers! Please try again later 😢'
    });
  }
};

// Get customer details 👤
const getCustomerDetails = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const customerId = req.params.id;

    // Get customer basic info
    const customer = await User.findById(customerId)
      .select('firstName lastName email phoneNumber createdAt');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found! 🔍'
      });
    }

    // Get customer's transaction history with this business
    const transactions = await Transaction.find({
      userId: customerId,
      businessId
    })
    .sort({ createdAt: -1 })
    .select('amount createdAt voucherId location');

    // Calculate customer metrics
    const metrics = {
      totalSpent: transactions.reduce((sum, t) => sum + t.amount, 0),
      averageSpent: transactions.length ? 
        transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length : 0,
      visitsCount: transactions.length,
      firstVisit: transactions.length ? 
        transactions[transactions.length - 1].createdAt : null,
      lastVisit: transactions.length ? 
        transactions[0].createdAt : null
    };

    res.json({
      success: true,
      data: {
        customer,
        metrics,
        transactions
      }
    });
  } catch (error) {
    console.error('Get customer details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer details! Please try again later 😢'
    });
  }
};

// List staff members 👥
const listStaff = async (req, res) => {
  try {
    const businessId = req.user.userId;

    const staff = await User.find({
      'businessProfile.businessId': businessId,
      role: { $in: ['manager', 'staff'] }
    })
    .select('firstName lastName email role permissions lastLogin')
    .sort({ role: 1, firstName: 1 });

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('List staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members! Please try again later 😢'
    });
  }
};

// Add staff member 👥
const addStaffMember = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { email, firstName, lastName, role, permissions } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered! 📧'
      });
    }

    // Create staff member
    const staffMember = new User({
      email,
      firstName,
      lastName,
      role,
      permissions,
      businessProfile: {
        businessId,
        role,
        permissions
      },
      password: Math.random().toString(36).slice(-8) // Generate random password
    });

    await staffMember.save();

    // TODO: Send invitation email with password

    res.status(201).json({
      success: true,
      message: 'Staff member added successfully! 🎉',
      data: {
        id: staffMember._id,
        email: staffMember.email,
        firstName: staffMember.firstName,
        lastName: staffMember.lastName,
        role: staffMember.role,
        permissions: staffMember.permissions
      }
    });
  } catch (error) {
    console.error('Add staff member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add staff member! Please try again later 😢'
    });
  }
};

// Remove staff member 🚫
const removeStaffMember = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const staffId = req.params.id;

    const staffMember = await User.findOneAndUpdate(
      {
        _id: staffId,
        'businessProfile.businessId': businessId,
        role: { $in: ['manager', 'staff'] }
      },
      {
        $unset: {
          businessProfile: 1,
          permissions: 1
        },
        $set: {
          role: 'customer'
        }
      }
    );

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Staff member removed successfully! 👋'
    });
  } catch (error) {
    console.error('Remove staff member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove staff member! Please try again later 😢'
    });
  }
};

// Get all businesses (Admin only) 🏢
const getAllBusinesses = async (req, res) => {
  try {
    // Get pagination parameters 📄
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get search and filter parameters 🔍
    const search = req.query.search || '';
    const status = req.query.status;
    const category = req.query.category;
    const verificationStatus = req.query.verified;
    const subscriptionStatus = req.query.subscriptionStatus;

    // Build query 🏗️
    const query = { role: 'business' };

    // Add search condition
    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    // Add verification filter
    if (verificationStatus !== undefined) {
      query.isVerified = verificationStatus === 'true';
    }

    // Add status filter
    if (status) {
      query.isActive = status === 'active';
    }

    // Add category filter
    if (category) {
      query['businessProfile.category'] = category;
    }

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Get businesses with pagination
    const businesses = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get subscription details for each business
    const businessesWithDetails = await Promise.all(
      businesses.map(async (business) => {
        const subscription = await Subscription.findOne({ 
          userId: business._id,
          status: 'active'
        });
        
        // Format business data
        const businessData = {
          id: business._id,
          basicInfo: {
            firstName: business.firstName,
            lastName: business.lastName,
            email: business.email,
            phoneNumber: business.phoneNumber || 'Not provided',
            profilePicture: business.picUrl || null
          },
          businessProfile: {
            businessName: business.businessProfile?.businessName || 'Not set',
            category: business.businessProfile?.category || 'Not set',
            description: business.businessProfile?.description || 'Not provided'
          },
          status: {
            isVerified: business.isVerified,
            isActive: business.isActive,
            verificationBadge: business.isVerified ? '✅' : '⚠️',
            activeStatus: business.isActive ? '🟢 Active' : '🔴 Inactive'
          },
          subscription: subscription ? {
            plan: subscription.plan,
            status: subscription.status,
            validUntil: subscription.billing?.currentPeriodEnd,
            autoRenew: !subscription.billing?.cancelAtPeriodEnd
          } : {
            plan: 'No active subscription',
            status: 'inactive',
            validUntil: null,
            autoRenew: false
          },
          gdprConsent: {
            marketing: business.gdprConsent?.marketing || false,
            analytics: business.gdprConsent?.analytics || false,
            lastUpdated: business.gdprConsent?.consentDate
          },
          activity: {
            lastLogin: business.lastLogin || 'Never logged in',
            createdAt: business.createdAt,
            updatedAt: business.updatedAt
          }
        };

        return businessData;
      })
    );

    // Calculate statistics
    const stats = {
      total,
      verified: businessesWithDetails.filter(b => b.status.isVerified).length,
      unverified: businessesWithDetails.filter(b => !b.status.isVerified).length,
      active: businessesWithDetails.filter(b => b.status.isActive).length,
      inactive: businessesWithDetails.filter(b => !b.status.isActive).length,
      withSubscription: businessesWithDetails.filter(b => b.subscription.status === 'active').length
    };

    res.json({
      success: true,
      data: {
        statistics: stats,
        businesses: businessesWithDetails,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get all businesses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch businesses! Please try again later 😢',
      error: error.message
    });
  }
};

module.exports = {
  getBusinessProfile,
  updateBusinessProfile,
  listCustomers,
  getCustomerDetails,
  listStaff,
  addStaffMember,
  removeStaffMember,
  getAllBusinesses
}; 