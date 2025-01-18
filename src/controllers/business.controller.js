// Import dependencies 📦
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const { Subscription } = require('../models/subscription.model');
const mongoose = require('mongoose');

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
    const userId = req.body.userId;
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
    const { page = 1, limit = 10, search, status } = req.query;

    // Convert businessId to ObjectId 🔄
    const businessObjectId = new mongoose.Types.ObjectId(businessId);

    // Build base query for both regular and guest users 🔍
    const baseQuery = {
      $or: [
        { 'voucherClaims.businessId': businessObjectId }, // Regular users with voucher claims
        { 'guestDetails.businessId': businessObjectId }   // Guest users
      ]
    };

    // Add search filter if provided 🔎
    if (search) {
      baseQuery.$and = [{
        $or: [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { phoneNumber: new RegExp(search, 'i') }
        ]
      }];
    }

    // Add status filter if provided 🏷️
    if (status) {
      switch(status) {
        case 'active':
          baseQuery['voucherClaims.status'] = 'claimed';
          break;
        case 'redeemed':
          baseQuery['voucherClaims.status'] = 'redeemed';
          break;
        case 'expired':
          baseQuery['voucherClaims.status'] = 'expired';
          break;
        case 'guest':
          baseQuery.isGuest = true;
          break;
      }
    }

    const skip = (page - 1) * limit;

    // Get customers with aggregation pipeline 📊
    const customers = await User.aggregate([
      {
        $match: baseQuery
      },
      // Add default arrays if null 🔄
      {
        $addFields: {
          voucherClaims: {
            $ifNull: ['$voucherClaims', []]
          },
          transactions: []
        }
      },
      // Lookup voucher details 🎫
      {
        $lookup: {
          from: 'coupons',
          localField: 'voucherClaims.voucherId',
          foreignField: '_id',
          as: 'voucherDetails'
        }
      },
      // Lookup transaction details 💳
      {
        $lookup: {
          from: 'transactions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$userId'] },
                    { $eq: ['$businessId', businessObjectId] }
                  ]
                }
              }
            },
            { $sort: { createdAt: -1 } }
          ],
          as: 'transactions'
        }
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          isGuest: 1,
          guestDetails: 1,
          createdAt: 1,
          // Filter voucher claims for this business 🎫
          voucherClaims: {
            $filter: {
              input: '$voucherClaims',
              as: 'claim',
              cond: { 
                $eq: ['$$claim.businessId', businessObjectId]
              }
            }
          },
          // Calculate customer metrics 📊
          metrics: {
            totalSpent: {
              $sum: {
                $ifNull: ['$transactions.amount', 0]
              }
            },
            totalDiscounts: {
              $sum: {
                $ifNull: ['$transactions.discountAmount', 0]
              }
            },
            visitsCount: {
              $size: {
                $ifNull: ['$transactions', []]
              }
            },
            lastVisit: {
              $max: {
                $ifNull: ['$transactions.createdAt', null]
              }
            },
            firstVisit: {
              $min: {
                $ifNull: ['$transactions.createdAt', null]
              }
            },
            activeClaims: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ['$voucherClaims', []]
                  },
                  as: 'claim',
                  cond: { 
                    $and: [
                      { $eq: ['$$claim.businessId', businessObjectId] },
                      { $eq: ['$$claim.status', 'claimed'] }
                    ]
                  }
                }
              }
            },
            redeemedClaims: {
              $size: {
                $filter: {
                  input: {
                    $ifNull: ['$voucherClaims', []]
                  },
                  as: 'claim',
                  cond: { 
                    $and: [
                      { $eq: ['$$claim.businessId', businessObjectId] },
                      { $eq: ['$$claim.status', 'redeemed'] }
                    ]
                  }
                }
              }
            }
          },
          // Get latest transactions 💰
          recentTransactions: {
            $slice: [{
              $ifNull: ['$transactions', []]
            }, 5]
          },
          // Include voucher details 🎫
          voucherDetails: 1
        }
      },
      {
        $sort: { 
          'metrics.lastVisit': -1,
          createdAt: -1  // Secondary sort for users without visits
        }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    // Get total count for pagination 📄
    const total = await User.countDocuments(baseQuery);

    // Process customers to add additional info 🔄
    const processedCustomers = customers.map(customer => ({
      id: customer._id,
      basicInfo: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber || null,
        dateOfBirth: customer.dateOfBirth || null,
        isGuest: customer.isGuest || false,
        guestSource: customer.isGuest ? customer.guestDetails?.claimedFrom : null,
        joinedDate: customer.createdAt,
        picUrl: customer.picUrl || null,
        gdprConsent: customer.gdprConsent || {
          marketing: false,
          analytics: false,
          consentDate: null
        },
        lastLogin: customer.lastLogin || null,
        isVerified: customer.isVerified || false,
        isActive: customer.isActive || false
      },
      voucherActivity: {
        claims: (customer.voucherClaims || []).map(claim => {
          const voucherDetail = customer.voucherDetails?.find(v => 
            v._id.toString() === claim.voucherId.toString()
          );
          return {
            id: claim._id,
            voucherId: claim.voucherId,
            status: claim.status,
            claimDate: claim.claimDate,
            redeemedDate: claim.redeemedDate,
            expiryDate: claim.expiryDate,
            claimMethod: claim.claimMethod,
            analytics: {
              ...claim.analytics,
              clickDate: claim.analytics?.clickDate || null,
              viewDate: claim.analytics?.viewDate || null,
              redeemDate: claim.analytics?.redeemDate || null
            },
            voucherInfo: voucherDetail ? {
              title: voucherDetail.title,
              discountType: voucherDetail.discountType,
              discountValue: voucherDetail.discountValue,
              code: voucherDetail.code,
              minimumPurchase: voucherDetail.minimumPurchase || 0,
              maximumDiscount: voucherDetail.maximumDiscount || null
            } : null
          };
        }),
        stats: {
          activeClaims: customer.metrics.activeClaims || 0,
          redeemedClaims: customer.metrics.redeemedClaims || 0,
          totalClaims: (customer.voucherClaims || []).length
        }
      },
      transactionHistory: {
        totalSpent: customer.metrics.totalSpent || 0,
        totalDiscounts: customer.metrics.totalDiscounts || 0,
        visitsCount: customer.metrics.visitsCount || 0,
        lastVisit: customer.metrics.lastVisit,
        firstVisit: customer.metrics.firstVisit,
        averageSpent: customer.metrics.totalSpent && customer.metrics.visitsCount ? 
          (customer.metrics.totalSpent / customer.metrics.visitsCount).toFixed(2) : 0,
        recentTransactions: (customer.recentTransactions || []).map(tx => ({
          id: tx._id,
          amount: tx.amount,
          discountAmount: tx.discountAmount,
          date: tx.createdAt,
          voucherId: tx.voucherId,
          location: tx.location || null,
          status: tx.status || 'completed'
        }))
      },
      engagement: {
        lastActive: customer.lastLogin || customer.metrics.lastVisit || customer.createdAt,
        totalVoucherViews: customer.voucherClaims?.reduce((sum, claim) => 
          sum + (claim.analytics?.viewCount || 0), 0) || 0,
        totalVoucherClicks: customer.voucherClaims?.reduce((sum, claim) => 
          sum + (claim.analytics?.clickCount || 0), 0) || 0,
        conversionRate: customer.metrics.visitsCount && customer.metrics.redeemedClaims ? 
          ((customer.metrics.redeemedClaims / customer.metrics.visitsCount) * 100).toFixed(2) : "0.00"
      }
    }));

    // Calculate summary statistics 📊
    const summary = {
      total,
      activeCustomers: processedCustomers.filter(c => c.voucherActivity.stats.activeClaims > 0).length,
      guestCustomers: processedCustomers.filter(c => c.basicInfo.isGuest).length,
      totalRevenue: processedCustomers.reduce((sum, c) => sum + (c.transactionHistory.totalSpent || 0), 0),
      totalDiscounts: processedCustomers.reduce((sum, c) => sum + (c.transactionHistory.totalDiscounts || 0), 0)
    };

    res.json({
      success: true,
      data: {
        customers: processedCustomers,
        summary,
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
    // Check if user is admin 👑
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can access this resource! 🚫'
      });
    }

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
    const sortBy = req.query.sortBy || 'createdAt'; // Default sort by creation date
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1; // Default to descending

    // Build query 🏗️
    const query = { role: 'business' };

    // Add search condition
    if (search) {
      query.$or = [
        { 'businessProfile.businessName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
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

    // Get businesses with pagination and sorting
    const businesses = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    // Get subscription details for each business
    const businessesWithDetails = await Promise.all(
      businesses.map(async (business) => {
        const subscription = await Subscription.findOne({ 
          businessId: business._id
        }).sort({ createdAt: -1 }); // Get the most recent subscription
        
        // Format business data
        return {
          id: business._id,
          basicInfo: {
            firstName: business.firstName,
            lastName: business.lastName,
            email: business.email,
            phoneNumber: business.phoneNumber || 'Not provided',
            profilePicture: business.picUrl || null,
            dateOfBirth: business.dateOfBirth || null
          },
          businessProfile: {
            businessName: business.businessProfile?.businessName || business.businessName || 'Not set',
            category: business.businessProfile?.category || business.businessCategory || 'Not set',
            description: business.businessProfile?.description || business.businessDescription || 'Not provided',
            location: {
              address: business.businessProfile?.location?.address || business.businessLocation?.address || null,
              city: business.businessProfile?.location?.city || business.businessLocation?.city || null,
              state: business.businessProfile?.location?.state || business.businessLocation?.state || null,
              country: business.businessProfile?.location?.country || business.businessLocation?.country || null,
              zipCode: business.businessProfile?.location?.zipCode || business.businessLocation?.zipCode || null,
              coordinates: {
                lat: business.businessProfile?.location?.coordinates?.lat || business.businessLocation?.coordinates?.lat || null,
                lng: business.businessProfile?.location?.coordinates?.lng || business.businessLocation?.coordinates?.lng || null
              }
            }
          },
          status: {
            isVerified: business.isVerified || false,
            isActive: business.isActive || false,
            verificationBadge: business.isVerified ? '✅' : '⚠️',
            activeStatus: business.isActive ? '🟢 Active' : '🔴 Inactive'
          },
          subscription: subscription ? {
            plan: subscription.plan,
            status: subscription.status,
            validUntil: subscription.billing?.currentPeriodEnd,
            autoRenew: !subscription.billing?.cancelAtPeriodEnd,
            features: subscription.features || {},
            stripeDetails: {
              customerId: subscription.stripeCustomerId,
              subscriptionId: subscription.stripeSubscriptionId
            }
          } : {
            plan: 'No active subscription',
            status: 'inactive',
            validUntil: null,
            autoRenew: false,
            features: {}
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
          },
          metadata: {
            registrationIP: business.registrationIP,
            lastLoginIP: business.lastLoginIP,
            deviceInfo: business.deviceInfo || {},
            browser: business.browser || 'Unknown'
          }
        };
      })
    );

    // Calculate statistics 📊
    const stats = {
      total,
      activeToday: businessesWithDetails.filter(b => {
        const today = new Date();
        const lastLogin = new Date(b.activity.lastLogin);
        return b.status.isActive && lastLogin.toDateString() === today.toDateString();
      }).length,
      byStatus: {
        verified: businessesWithDetails.filter(b => b.status.isVerified).length,
        unverified: businessesWithDetails.filter(b => !b.status.isVerified).length,
        active: businessesWithDetails.filter(b => b.status.isActive).length,
        inactive: businessesWithDetails.filter(b => !b.status.isActive).length
      },
      bySubscription: {
        basic: businessesWithDetails.filter(b => b.subscription.plan === 'basic').length,
        premium: businessesWithDetails.filter(b => b.subscription.plan === 'premium').length,
        enterprise: businessesWithDetails.filter(b => b.subscription.plan === 'enterprise').length,
        noSubscription: businessesWithDetails.filter(b => b.subscription.plan === 'No active subscription').length
      },
      byConsent: {
        marketing: businessesWithDetails.filter(b => b.gdprConsent.marketing).length,
        analytics: businessesWithDetails.filter(b => b.gdprConsent.analytics).length
      }
    };

    // Return formatted response
    return res.json({
      success: true,
      timestamp: new Date(),
      data: {
        statistics: stats,
        businesses: businessesWithDetails,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
          nextPage: page < Math.ceil(total / limit) ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null
        },
        filters: {
          search: search || null,
          status: status || null,
          category: category || null,
          verificationStatus: verificationStatus || null,
          subscriptionStatus: subscriptionStatus || null
        },
        sorting: {
          field: sortBy,
          order: sortOrder === 1 ? 'asc' : 'desc'
        }
      },
      message: 'Businesses fetched successfully! 🎉'
    });
  } catch (error) {
    console.error('Get all businesses error:', error);
    return res.status(500).json({
      success: false,
      timestamp: new Date(),
      message: 'Failed to fetch businesses! Please try again later 😢',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
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