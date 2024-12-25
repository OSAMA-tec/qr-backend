// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const Transaction = require('../models/transaction.model');

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

module.exports = {
  getProfile,
  updateProfile,
  updateGdprConsent,
  getVouchers,
  getVoucherDetails,
  getWalletPasses
}; 