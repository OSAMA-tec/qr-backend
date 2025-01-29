// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const Transaction = require('../models/transaction.model');
const { uploadToFirebase } = require('../utils/upload.utils');

// Get user profile 👤
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile! Please try again later 😢'
    });
  }
};

// Update user profile ✏️
const updateProfile = async (req, res) => {
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

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully! 🎉',
      data: user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile! Please try again later 😢'
    });
  }
};

// Update GDPR consent 📜
const updateGdprConsent = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { marketing, analytics } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'gdprConsent.marketing': marketing,
          'gdprConsent.analytics': analytics,
          'gdprConsent.consentDate': new Date()
        }
      },
      { new: true }
    ).select('gdprConsent');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'GDPR preferences updated successfully! 🎉',
      data: user.gdprConsent
    });
  } catch (error) {
    console.error('Update GDPR consent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update GDPR preferences! Please try again later 😢'
    });
  }
};

// Get user's vouchers 🎟️
const getVouchers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const vouchers = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Coupon.countDocuments(query);

    res.json({
      success: true,
      data: {
        vouchers,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get vouchers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vouchers! Please try again later 😢'
    });
  }
};

// Get specific voucher details 🎫
const getVoucherDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const voucherId = req.params.id;

    const voucher = await Coupon.findOne({
      _id: voucherId,
      userId
    }).populate('businessId', 'name logo address');

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    // Get redemption history if voucher is used
    let redemptionHistory = null;
    if (voucher.status === 'used') {
      redemptionHistory = await Transaction.findOne({
        voucherId,
        userId
      }).select('createdAt amount location');
    }

    res.json({
      success: true,
      data: {
        voucher,
        redemptionHistory
      }
    });
  } catch (error) {
    console.error('Get voucher details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher details! Please try again later 😢'
    });
  }
};

// Get digital wallet passes 📱
const getWalletPasses = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get active vouchers that can be added to wallet
    const activeVouchers = await Coupon.find({
      userId,
      status: 'active',
      'walletPass.isEnabled': true
    }).select('walletPass code discount expiryDate businessId');

    // Format passes for both Apple and Google
    const passes = activeVouchers.map(voucher => ({
      id: voucher._id,
      code: voucher.code,
      discount: voucher.discount,
      expiryDate: voucher.expiryDate,
      appleWalletUrl: voucher.walletPass.appleWalletUrl,
      googleWalletUrl: voucher.walletPass.googleWalletUrl
    }));

    res.json({
      success: true,
      data: passes
    });
  } catch (error) {
    console.error('Get wallet passes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet passes! Please try again later 😢'
    });
  }
};

// Upload profile picture 🖼️
const uploadProfilePic = async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded! Please select an image file 🚫'
      });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed! 🖼️'
      });
    }

    // Get user ID from auth middleware
    const userId = req.user.userId;

    // Upload to Firebase
    const imageUrl = await uploadToFirebase(req.file, `profile-pictures/${userId}`);

    // Update user profile with new image URL
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { picUrl: imageUrl },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully! 🎉',
      data: {
        user: updatedUser,
        imageUrl: imageUrl
      }
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete profile picture 🗑️
const deleteProfilePic = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Update user to remove profile picture URL
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { picUrl: 1 } },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile picture deleted successfully! 🗑️',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('Profile picture deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile picture! 😢',
      error: error.message
    });
  }
};

// Get all customers (Admin only) 👥
const getAllCustomers = async (req, res) => {
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
    const verificationStatus = req.query.verified;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query 🏗️
    const query = { role: 'customer' };

    // Add search condition
    if (search) {
      query.$or = [
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

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Get customers with pagination and sorting
    const customers = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    // Get additional details for each customer
    const customersWithDetails = await Promise.all(
      customers.map(async (customer) => {
        // Get transaction statistics
        const transactions = await Transaction.find({ userId: customer._id });
        
        // Get active vouchers count
        const activeVouchers = await Coupon.countDocuments({ 
          userId: customer._id,
          expiryDate: { $gt: new Date() },
          isRedeemed: false
        });

        return {
          id: customer._id,
          basicInfo: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phoneNumber: customer.phoneNumber || 'Not provided',
            profilePicture: customer.picUrl || null,
            dateOfBirth: customer.dateOfBirth || null
          },
          status: {
            isVerified: customer.isVerified || false,
            isActive: customer.isActive || false,
            verificationBadge: customer.isVerified ? '✅' : '⚠️',
            activeStatus: customer.isActive ? '🟢 Active' : '🔴 Inactive'
          },
          statistics: {
            totalTransactions: transactions.length,
            totalSpent: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
            averageSpent: transactions.length ? 
              transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / transactions.length : 0,
            activeVouchers,
            lastTransaction: transactions.length ? 
              transactions.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt : null
          },
          gdprConsent: {
            marketing: customer.gdprConsent?.marketing || false,
            analytics: customer.gdprConsent?.analytics || false,
            lastUpdated: customer.gdprConsent?.consentDate
          },
          activity: {
            lastLogin: customer.lastLogin || 'Never logged in',
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt
          },
          metadata: {
            registrationIP: customer.registrationIP,
            lastLoginIP: customer.lastLoginIP,
            deviceInfo: customer.deviceInfo || {},
            browser: customer.browser || 'Unknown'
          }
        };
      })
    );

    // Calculate statistics 📊
    const stats = {
      total,
      activeToday: customersWithDetails.filter(c => {
        const today = new Date();
        const lastLogin = new Date(c.activity.lastLogin);
        return c.status.isActive && lastLogin.toDateString() === today.toDateString();
      }).length,
      byStatus: {
        verified: customersWithDetails.filter(c => c.status.isVerified).length,
        unverified: customersWithDetails.filter(c => !c.status.isVerified).length,
        active: customersWithDetails.filter(c => c.status.isActive).length,
        inactive: customersWithDetails.filter(c => !c.status.isActive).length
      },
      byConsent: {
        marketing: customersWithDetails.filter(c => c.gdprConsent.marketing).length,
        analytics: customersWithDetails.filter(c => c.gdprConsent.analytics).length
      }
    };

    // Return formatted response
    return res.json({
      success: true,
      timestamp: new Date(),
      data: {
        statistics: stats,
        customers: customersWithDetails,
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
          verificationStatus: verificationStatus || null
        },
        sorting: {
          field: sortBy,
          order: sortOrder === 1 ? 'asc' : 'desc'
        }
      },
      message: 'Customers fetched successfully! 🎉'
    });
  } catch (error) {
    console.error('Get all customers error:', error);
    return res.status(500).json({
      success: false,
      timestamp: new Date(),
      message: 'Failed to fetch customers! Please try again later 😢',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

// Get customer details (Admin only) 👤
const getCustomerDetails = async (req, res) => {
  try {
    // Check if user is admin 👑
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can access this resource! 🚫'
      });
    }

    const customerId = req.params.id;

    // Get customer basic info
    const customer = await User.findOne({ 
      _id: customerId,
      role: 'customer'
    }).select('-password -resetPasswordToken -resetPasswordExpires -verificationToken');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found! 🔍'
      });
    }

    // Get all customer transactions
    const transactions = await Transaction.find({ userId: customerId })
      .sort({ createdAt: -1 })
      .populate('businessId', 'businessName email');

    // Get customer's vouchers
    const vouchers = await Coupon.find({ userId: customerId })
      .sort({ createdAt: -1 })
      .populate('businessId', 'businessName email');

    // Calculate customer metrics
    const metrics = {
      transactions: {
        total: transactions.length,
        totalSpent: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        averageSpent: transactions.length ? 
          transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / transactions.length : 0,
        firstTransaction: transactions.length ? 
          transactions[transactions.length - 1].createdAt : null,
        lastTransaction: transactions.length ? 
          transactions[0].createdAt : null,
        byBusiness: transactions.reduce((acc, t) => {
          const businessId = t.businessId?._id?.toString();
          if (!businessId) return acc;
          if (!acc[businessId]) {
            acc[businessId] = {
              businessName: t.businessId.businessName,
              count: 0,
              total: 0
            };
          }
          acc[businessId].count++;
          acc[businessId].total += t.amount || 0;
          return acc;
        }, {})
      },
      vouchers: {
        total: vouchers.length,
        active: vouchers.filter(v => !v.isRedeemed && v.expiryDate > new Date()).length,
        redeemed: vouchers.filter(v => v.isRedeemed).length,
        expired: vouchers.filter(v => !v.isRedeemed && v.expiryDate <= new Date()).length,
        byBusiness: vouchers.reduce((acc, v) => {
          const businessId = v.businessId?._id?.toString();
          if (!businessId) return acc;
          if (!acc[businessId]) {
            acc[businessId] = {
              businessName: v.businessId.businessName,
              total: 0,
              active: 0,
              redeemed: 0,
              expired: 0
            };
          }
          acc[businessId].total++;
          if (v.isRedeemed) acc[businessId].redeemed++;
          else if (v.expiryDate <= new Date()) acc[businessId].expired++;
          else acc[businessId].active++;
          return acc;
        }, {})
      }
    };

    return res.json({
      success: true,
      timestamp: new Date(),
      data: {
        basicInfo: {
          id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phoneNumber: customer.phoneNumber || 'Not provided',
          profilePicture: customer.picUrl || null,
          dateOfBirth: customer.dateOfBirth || null
        },
        status: {
          isVerified: customer.isVerified || false,
          isActive: customer.isActive || false,
          verificationBadge: customer.isVerified ? '✅' : '⚠️',
          activeStatus: customer.isActive ? '🟢 Active' : '🔴 Inactive'
        },
        metrics,
        activity: {
          lastLogin: customer.lastLogin || 'Never logged in',
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt
        },
        gdprConsent: {
          marketing: customer.gdprConsent?.marketing || false,
          analytics: customer.gdprConsent?.analytics || false,
          lastUpdated: customer.gdprConsent?.consentDate
        },
        recentActivity: {
          transactions: transactions.slice(0, 5).map(t => ({
            id: t._id,
            amount: t.amount,
            business: {
              id: t.businessId?._id,
              name: t.businessId?.businessName
            },
            date: t.createdAt
          })),
          vouchers: vouchers.slice(0, 5).map(v => ({
            id: v._id,
            code: v.code,
            business: {
              id: v.businessId?._id,
              name: v.businessId?.businessName
            },
            status: v.isRedeemed ? 'Redeemed' : 
                    v.expiryDate <= new Date() ? 'Expired' : 'Active',
            expiryDate: v.expiryDate,
            redeemedAt: v.redeemedAt
          }))
        }
      },
      message: 'Customer details fetched successfully! 🎉'
    });
  } catch (error) {
    console.error('Get customer details error:', error);
    return res.status(500).json({
      success: false,
      timestamp: new Date(),
      message: 'Failed to fetch customer details! Please try again later 😢',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateGdprConsent,
  getVouchers,
  getVoucherDetails,
  getWalletPasses,
  uploadProfilePic,
  deleteProfilePic,
  getAllCustomers,
  getCustomerDetails
}; 