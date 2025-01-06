// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const WidgetTemplate = require('../models/widgetTemplate.model');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

// Get voucher details 🎫
const getVoucherPopup = async (req, res) => {
  try {
    const { voucherId } = req.params;

    // Find active voucher with widget template
    const voucher = await Coupon.findOne({
      _id: voucherId,
      isActive: true
    }).populate([
      {
        path: 'businessId',
        select: 'businessProfile.businessName businessProfile.logo businessProfile.widgetSettings'
      },
      {
        path: 'widgetTemplateId',
        select: 'name category settings design content'
      }
    ]);

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

    // Get widget settings
    const widgetSettings = voucher.businessId.businessProfile.widgetSettings || {};
    const templateSettings = voucher.widgetTemplateId?.settings || {};

    // Return voucher data
    res.json({
      success: true,
      data: {
        voucher: {
          id: voucher._id,
          title: voucher.title,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          expiryDate: voucher.endDate,
        },
        business: {
          name: voucher.businessId.businessProfile.businessName,
          logo: voucher.businessId.businessProfile.logo
        },
        design: {
          ...templateSettings.design,
          ...widgetSettings.colors,
          logo: voucher.businessId.businessProfile.logo
        }
      }
    });
  } catch (error) {
    console.error('Get voucher popup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load voucher details! 😢'
    });
  }
};

// Register and claim voucher 📝
const registerAndClaimVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const { firstName, lastName, email, password, phoneNumber, age, gender } = req.body;

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
      isVerified: false,
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
    
    res.json({
      success: true,
      data: {
        claimId,
        userId: user._id,
        voucherId
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

    // Get user and voucher details
    const [user, voucher] = await Promise.all([
      User.findById(userId),
      Coupon.findOne({
        _id: voucherId,
        isActive: true
      }).populate('businessId', 'businessProfile')
    ]);

    if (!user || !voucher) {
      return res.status(404).json({
        success: false,
        message: 'Invalid claim details! 🚫'
      });
    }

    // Generate QR code
    const qrCode = await QRCode.toDataURL(claimId);

    res.json({
      success: true,
      data: {
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        voucher: {
          title: voucher.title,
          description: voucher.description,
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          expiryDate: voucher.endDate,
          qrCode
        },
        business: {
          name: voucher.businessId.businessProfile.businessName,
          logo: voucher.businessId.businessProfile.logo
        }
      }
    });
  } catch (error) {
    console.error('Get claimed voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load claimed voucher! 😢'
    });
  }
};

module.exports = {
  getVoucherPopup,
  registerAndClaimVoucher,
  getClaimedVoucher
}; 