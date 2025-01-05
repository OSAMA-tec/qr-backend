// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Get voucher popup details 🎫
const getVoucherPopup = async (req, res) => {
  try {
    const { voucherId } = req.params;

    // Find active voucher
    const voucher = await Coupon.findOne({
      _id: voucherId,
      isActive: true,
    }).populate('businessId', 'businessProfile.businessName businessProfile.logo');

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found or expired! 🚫'
      });
    }

    // Increment views counter
    await Coupon.updateOne(
      { _id: voucherId },
      { $inc: { 'analytics.views': 1 } }
    );

    // Return limited voucher info for popup
    res.json({
      success: true,
      data: {
        voucherId: voucher._id,
        title: voucher.title,
        description: voucher.description,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        expiryDate: voucher.endDate,
        business: {
          name: voucher.businessId.businessProfile.businessName,
          logo: voucher.businessId.businessProfile.logo
        }
      }
    });
  } catch (error) {
    console.error('Get voucher popup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher details! 😢'
    });
  }
};

// Register user and claim voucher 📝
const registerAndClaimVoucher = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      age,
      gender,
      voucherId
    } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered! Please login to claim voucher. 📧'
      });
    }

    // Find voucher and business
    const voucher = await Coupon.findOne({
      _id: voucherId,
      isActive: true
    }).select('businessId');

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found or inactive! 🚫'
      });
    }

    // Create new user
    user = new User({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      role: 'customer',
      dateOfBirth: age ? new Date().setFullYear(new Date().getFullYear() - age) : undefined,
      gender,
      isVerified: false, // Require email verification
      guestDetails: {
        claimedFrom: 'popup',
        businessId: voucher.businessId
      }
    });

    // Generate verification token
    user.verificationToken = crypto.randomBytes(32).toString('hex');
    
    await user.save();

    // Generate claim ID
    const claimId = crypto.randomBytes(16).toString('hex');

    // Return success with claim ID
    res.status(201).json({
      success: true,
      message: 'Registration successful! 🎉',
      data: {
        claimId,
        userId: user._id,
        verificationToken: user.verificationToken
      }
    });

  } catch (error) {
    console.error('Register and claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed! Please try again. 😢'
    });
  }
};

// Get claimed voucher details 🎯
const getClaimedVoucher = async (req, res) => {
  try {
    const { claimId } = req.params;
    const { userId, voucherId } = req.query;

    // Verify user and voucher
    const [user, voucher] = await Promise.all([
      User.findById(userId),
      Coupon.findOne({
        _id: voucherId,
        isActive: true
      })
    ]);

    if (!user || !voucher) {
      return res.status(404).json({
        success: false,
        message: 'Invalid claim details! 🚫'
      });
    }

    // Increment clicks counter
    await Coupon.updateOne(
      { _id: voucherId },
      { $inc: { 'analytics.clicks': 1 } }
    );

    // Return complete voucher details
    res.json({
      success: true,
      data: {
        voucher: {
          id: voucher._id,
          code: voucher.code,
          title: voucher.title,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          expiryDate: voucher.endDate,
          qrCode: voucher.qrCode
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
    console.error('Get claimed voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claimed voucher! 😢'
    });
  }
};

module.exports = {
  getVoucherPopup,
  registerAndClaimVoucher,
  getClaimedVoucher
}; 