// Import dependencies 📦
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const WidgetTemplate = require('../models/widgetTemplate.model');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Create new voucher template 🎟️
const createVoucher = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const voucherData = req.body;

    // Check if widget template exists and is active 🎨
    if (!voucherData.widgetTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Widget template ID is required! 🎨'
      });
    }

    const widgetTemplate = await WidgetTemplate.findOne({
      _id: voucherData.widgetTemplateId,
      isActive: true
    });

    if (!widgetTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Widget template not found or inactive! 🚫'
      });
    }

    // Generate unique code if not provided 🎯
    if (!voucherData.code) {
      voucherData.code = crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Create QR code with widget template info 📱
    const qrCodeData = await QRCode.toDataURL(JSON.stringify({
      code: voucherData.code,
      businessId,
      widgetTemplateId: voucherData.widgetTemplateId,
      type: 'voucher'
    }));

    // Create voucher with widget template 🎫
    const voucher = new Coupon({
      ...voucherData,
      businessId,
      qrCode: {
        data: qrCodeData,
        url: `${process.env.BASE_URL}/voucher/${voucherData.code}`
      }
    });

    // Validate dates 📅
    const now = new Date();
    if (new Date(voucher.startDate) < now) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be in the future! ⚠️'
      });
    }

    if (new Date(voucher.endDate) <= new Date(voucher.startDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date! ⚠️'
      });
    }

    // Validate discount values 💰
    if (voucher.discountType === 'percentage' && voucher.discountValue > 100) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount cannot exceed 100%! 💯'
      });
    }

    await voucher.save();

    // Populate response with widget template details 🔍
    await voucher.populate([
      {
        path: 'widgetTemplateId',
        select: 'name category settings'
      }
    ]);

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully! 🎉',
      data: voucher
    });
  } catch (error) {
    console.error('Create voucher error:', error);

    // Handle validation errors ❌
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

    // Handle duplicate code error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Voucher code already exists! Please try another code. 🔄'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create voucher! 😢'
    });
  }
};

// List all vouchers 📋
const listVouchers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { page = 1, limit = 10, status, search } = req.query;

    const query = { businessId };

    // Add status filter 🔍
    if (status === 'active') {
      query.isActive = true;
      query.startDate = { $lte: new Date() };
      query.endDate = { $gte: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'expired') {
      query.endDate = { $lt: new Date() };
    } else if (status === 'scheduled') {
      query.startDate = { $gt: new Date() };
    }

    // Add search filter 🔎
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get vouchers with widget template details 🎫
    const [voucherResults, totalCount] = await Promise.all([
      Coupon.find(query)
        .populate({
          path: 'widgetTemplateId',
          select: 'name category settings thumbnail isActive',
          match: { isActive: true }
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Coupon.countDocuments(query)
    ]);

    // Process vouchers to include status and widget info 📊
    const processedVouchers = voucherResults.map(voucher => {
      const voucherObj = voucher.toObject();
      
      // Calculate voucher status
      const now = new Date();
      let status = 'inactive';
      
      if (voucher.isActive) {
        if (now < voucher.startDate) {
          status = 'scheduled';
        } else if (now > voucher.endDate) {
          status = 'expired';
        } else {
          status = 'active';
        }
      }

      // Add widget template status
      if (voucherObj.widgetTemplateId) {
        voucherObj.widgetStatus = {
          isConnected: true,
          template: voucherObj.widgetTemplateId
        };
      } else {
        voucherObj.widgetStatus = {
          isConnected: false,
          message: 'No widget template connected or template is inactive! 🚫'
        };
      }

      // Add usage stats
      voucherObj.stats = {
        usagePercentage: voucher.usageLimit?.perCoupon 
          ? (voucher.currentUsage / voucher.usageLimit.perCoupon) * 100 
          : 0,
        remainingUses: voucher.usageLimit?.perCoupon 
          ? voucher.usageLimit.perCoupon - voucher.currentUsage 
          : 'unlimited',
        analytics: voucher.analytics
      };

      return {
        ...voucherObj,
        status,
        timeRemaining: voucher.endDate > now 
          ? Math.ceil((voucher.endDate - now) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        vouchers: processedVouchers,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit)
        },
        summary: {
          total: totalCount,
          active: processedVouchers.filter(v => v.status === 'active').length,
          scheduled: processedVouchers.filter(v => v.status === 'scheduled').length,
          expired: processedVouchers.filter(v => v.status === 'expired').length,
          inactive: processedVouchers.filter(v => v.status === 'inactive').length
        }
      }
    });
  } catch (error) {
    console.error('List vouchers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vouchers! 😢'
    });
  }
};

// Get voucher details 🔍
const getVoucherDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.userId;

    const voucher = await Coupon.findOne({
      _id: id,
      businessId
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    // Get redemption history
    const redemptions = await Transaction.find({
      voucherId: id
    })
    .populate('userId', 'firstName lastName email')
    .select('userId amount createdAt location')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        voucher,
        redemptions
      }
    });
  } catch (error) {
    console.error('Get voucher details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher details! 😢'
    });
  }
};

// Update voucher ✏️
const updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.userId;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.code;
    delete updates.businessId;
    delete updates.qrCode;
    delete updates.currentUsage;
    delete updates.analytics;

    const voucher = await Coupon.findOneAndUpdate(
      { _id: id, businessId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Voucher updated successfully! 🎉',
      data: voucher
    });
  } catch (error) {
    console.error('Update voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voucher! 😢'
    });
  }
};

// Delete voucher 🗑️
const deleteVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.userId;

    const voucher = await Coupon.findOneAndDelete({
      _id: id,
      businessId
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Voucher deleted successfully! 🗑️'
    });
  } catch (error) {
    console.error('Delete voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete voucher! 😢'
    });
  }
};

// Activate/Deactivate voucher 🔄
const toggleVoucherStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.params; // 'activate' or 'deactivate'
    const businessId = req.user.userId;

    const voucher = await Coupon.findOneAndUpdate(
      { _id: id, businessId },
      { $set: { isActive: action === 'activate' } },
      { new: true }
    );

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: `Voucher ${action}d successfully! 🎉`,
      data: voucher
    });
  } catch (error) {
    console.error('Toggle voucher status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voucher status! 😢'
    });
  }
};

// Validate voucher 🔍
const validateVoucher = async (req, res) => {
  try {
    const { code, businessId, customerId } = req.body;

    const voucher = await Coupon.findOne({
      code,
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired voucher! 🚫'
      });
    }

    // Check usage limits
    if (voucher.usageLimit) {
      if (voucher.usageLimit.perCoupon && 
          voucher.currentUsage >= voucher.usageLimit.perCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Voucher usage limit reached! 🚫'
        });
      }

      if (voucher.usageLimit.perCustomer && customerId) {
        const customerUsage = await Transaction.countDocuments({
          voucherId: voucher._id,
          userId: customerId
        });

        if (customerUsage >= voucher.usageLimit.perCustomer) {
          return res.status(400).json({
            success: false,
            message: 'You have reached the maximum usage limit for this voucher! 🚫'
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        isValid: true,
        voucher: {
          id: voucher._id,
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          maximumDiscount: voucher.maximumDiscount
        }
      }
    });
  } catch (error) {
    console.error('Validate voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate voucher! 😢'
    });
  }
};

// Redeem voucher 💫
const redeemVoucher = async (req, res) => {
  try {
    const { voucherId, customerId, amount, location } = req.body;
    const businessId = req.user.userId;

    // Find and validate voucher with business check 🎫
    const voucher = await Coupon.findOne({
      _id: voucherId,
      businessId,
      isActive: true,
      // startDate: { $lte: new Date() },
      // endDate: { $gte: new Date() }
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired voucher! 🚫'
      });
    }

    // Check minimum purchase requirement 💰
    if (voucher.minimumPurchase && amount < voucher.minimumPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ${voucher.minimumPurchase} required! 💰`
      });
    }

    // Find user and validate voucher claim 👤
    const user = await User.findById(customerId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 👤'
      });
    }

    // Check if user has claimed this voucher
    const userClaim = user.voucherClaims.find(
      claim => claim.voucherId.toString() === voucherId && 
               claim.businessId.toString() === businessId &&
               claim.status === 'claimed'
    );

    if (!userClaim) {
      return res.status(400).json({
        success: false,
        message: 'User has not claimed this voucher! 🚫'
      });
    }

    // Check if voucher is already redeemed
    if (userClaim.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: 'Voucher already redeemed! 🔄'
      });
    }

    // Check if voucher has expired
    if (userClaim.expiryDate && new Date(userClaim.expiryDate) < new Date()) {
      // Update claim status to expired
      await User.updateOne(
        { 
          _id: customerId,
          'voucherClaims._id': userClaim._id 
        },
        { 
          $set: { 
            'voucherClaims.$.status': 'expired',
            'voucherClaims.$.updatedAt': new Date()
          }
        }
      );

      return res.status(400).json({
        success: false,
        message: 'Voucher has expired! ⌛'
      });
    }

    // Calculate discount amount 💸
    let discountAmount = 0;
    if (voucher.discountType === 'percentage') {
      discountAmount = (amount * voucher.discountValue) / 100;
      if (voucher.maximumDiscount) {
        discountAmount = Math.min(discountAmount, voucher.maximumDiscount);
      }
    } else {
      discountAmount = Math.min(voucher.discountValue, amount);
    }

    // Create transaction record 📝
    const transaction = new Transaction({
      userId: customerId,
      businessId,
      voucherId,
      amount,
      discountAmount,
      location,
      status: 'completed',
      redeemedAt: new Date()
    });

    await transaction.save();

    // Update user's voucher claim status ✅
    await User.updateOne(
      { 
        _id: customerId,
        'voucherClaims._id': userClaim._id 
      },
      { 
        $set: { 
          'voucherClaims.$.status': 'redeemed',
          'voucherClaims.$.redeemedDate': new Date(),
          'voucherClaims.$.analytics.redeemDate': new Date(),
          'voucherClaims.$.transactionId': transaction._id
        }
      }
    );

    // Update voucher usage and analytics 📊
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 
          currentUsage: 1,
          'analytics.redemptions': 1,
          'analytics.totalRevenue': amount
        },
        $set: {
          usedTrue: true,
          updatedAt: new Date()
        }
      }
    );

    // Check if voucher has reached usage limit 🎯
    if (voucher.usageLimit?.perCoupon && voucher.currentUsage + 1 >= voucher.usageLimit.perCoupon) {
      await Coupon.updateOne(
        { _id: voucherId },
        { $set: { isActive: false } }
      );
    }

    res.json({
      success: true,
      message: 'Voucher redeemed successfully! 🎉',
      data: {
        transaction: {
          id: transaction._id,
          amount,
          discountAmount,
          finalAmount: amount - discountAmount,
          redeemedAt: transaction.redeemedAt
        },
        voucher: {
          id: voucher._id,
          code: voucher.code,
          title: voucher.title,
          discountApplied: {
            type: voucher.discountType,
            value: voucher.discountValue,
            calculatedAmount: discountAmount
          }
        },
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('Redeem voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem voucher! 😢'
    });
  }
};

// Get claimed voucher users 👥
const getClaimedVoucherUsers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { search, page = 1, limit = 10 } = req.query;

    // Build search query 🔍
    const query = {
      'voucherClaims.businessId': businessId
    };

    // Add search filter if provided 🎯
    if (search) {
      query.$or = [
        { email: new RegExp(search, 'i') },
        { phoneNumber: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') }
      ];
    }

    // Get users with pagination 📄
    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select('firstName lastName email phoneNumber voucherClaims')
        .populate({
          path: 'voucherClaims.voucherId',
          select: 'title discountType discountValue code'
        })
        .sort({ 'voucherClaims.claimDate': -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Process user data 🔄
    const processedUsers = users.map(user => {
      const userData = user.toObject();
      
      // Filter voucher claims for this business
      userData.voucherClaims = userData.voucherClaims.filter(
        claim => claim.businessId.toString() === businessId
      );

      // Add claim stats
      userData.claimStats = {
        totalClaims: userData.voucherClaims.length,
        redeemedClaims: userData.voucherClaims.filter(
          claim => claim.status === 'redeemed'
        ).length
      };

      return userData;
    });

    res.json({
      success: true,
      data: {
        users: processedUsers,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit)
        },
        summary: {
          totalUsers: totalCount,
          activeUsers: processedUsers.filter(
            user => user.voucherClaims.some(claim => claim.status === 'claimed')
          ).length,
          redeemedUsers: processedUsers.filter(
            user => user.voucherClaims.some(claim => claim.status === 'redeemed')
          ).length
        }
      }
    });

  } catch (error) {
    console.error('Get claimed voucher users error:', error);
    res.status(500).json({
      success: false, 
      message: 'Failed to fetch claimed voucher users! 😢'
    });
  }
};
// Scan and validate QR code 📱
const scanVoucher = async (req, res) => {
  try {
    const businessId = req.user.userId;
    let voucherData;

    // Get voucher data from either parsed QR data or direct request body 🔄
    if (req.parsedQrData) {
      voucherData = req.parsedQrData;
    } else if (req.body.qrData) {
      try {
        voucherData = JSON.parse(req.body.qrData);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid QR data format! Please check your input 🚫'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'QR data is required! 📱'
      });
    }
    
    // Validate QR data type 🏷️
    if (!['voucher', 'claimed_voucher'].includes(voucherData.type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code type! 🚫'
      });
    }
    
    // Check if voucher belongs to scanning business 🏢
    if (voucherData.businessId !== businessId) {
      return res.status(403).json({
        success: false,
        message: 'This voucher is not valid for your business! 🏢'
      });
    }

    // Find and validate voucher 🔍
    const voucher = await Coupon.findOne({
      code: voucherData.code,
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Voucher is invalid or expired! ⌛'
      });
    }

    // Additional validation for claimed vouchers 🎫
    if (voucherData.type === 'claimed_voucher') {
      // Verify claim expiry
      if (new Date(voucherData.expiryDate) < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Claimed voucher has expired! ⌛'
        });
      }

      // Create verification hash using same method as generation 🔒
      const hashData = { ...voucherData };
      delete hashData.hash; // Remove hash before creating verification hash
      const verificationHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(hashData))
        .digest('hex');

      if (verificationHash !== voucherData.hash) {
        console.log('Hash Verification Failed:', {
          expected: voucherData.hash,
          calculated: verificationHash,
          qrData: hashData
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid claim signature! Security check failed 🔒'
        });
      }

      // Get user details if it's a claimed voucher 👤
      const user = await User.findById(voucherData.userId)
        .select('firstName lastName email phoneNumber');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found! 👤'
        });
      }

      // Return response with user details
      return res.json({
        success: true,
        data: {
          voucher: {
            id: voucher._id,
            code: voucher.code,
            discountType: voucher.discountType,
            discountValue: voucher.discountValue,
            minimumPurchase: voucher.minimumPurchase,
            maximumDiscount: voucher.maximumDiscount,
            type: voucherData.type,
            claimInfo: {
              claimId: voucherData.claimId,
              userId: voucherData.userId,
              expiryDate: voucherData.expiryDate
            }
          },
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber || null
          }
        }
      });
    }

    // Return response without user details for non-claimed vouchers
    res.json({
      success: true,
      data: {
        voucher: {
          id: voucher._id,
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          maximumDiscount: voucher.maximumDiscount,
          type: voucherData.type
        }
      }
    });

  } catch (error) {
    console.error('Scan voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan voucher! 😢'
    });
  }
};

module.exports = {
  createVoucher,
  listVouchers,
  getVoucherDetails,
  updateVoucher,
  deleteVoucher,
  toggleVoucherStatus,
  validateVoucher,
  redeemVoucher,
  getClaimedVoucherUsers,
  scanVoucher
}; 