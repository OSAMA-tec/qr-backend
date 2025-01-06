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
    const { businessId } = req.params;

    // Find active voucher with widget template
    const voucher = await Coupon.findOne({
      businessId,
      isActive: true,
      usedTrue: true,
      // startDate: { $lte: new Date() },
      // endDate: { $gte: new Date() }
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
        message: 'No active voucher found! 🚫'
      });
    }

    // Increment views counter
    await Coupon.updateOne(
      { _id: voucher._id },
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
    const { businessId } = req.params;
    const { firstName, lastName, email, password, phoneNumber, age, gender } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered! Please login to claim voucher. 📧'
      });
    }

    // Find active voucher
    const voucher = await Coupon.findOne({
      businessId,
      isActive: true,
      usedTrue: true,
      // startDate: { $lte: new Date() },
      // endDate: { $gte: new Date() }
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'No active voucher found! 🚫'
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

    // Increment clicks counter
    await Coupon.updateOne(
      { _id: voucher._id },
      { $inc: { 'analytics.clicks': 1 } }
    );

    // Generate claim ID
    const claimId = crypto.randomBytes(16).toString('hex');
    
    res.json({
      success: true,
      data: {
        claimId,
        userId: user._id,
        voucherId: voucher._id
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

// Toggle voucher usage status 🔄
const toggleVoucherUsage = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const  businessId  = req.user.userId;
    console.log(businessId)
    // Find current active voucher and deactivate it
    await Coupon.updateMany(
      { 
        businessId,
        usedTrue: true
      },
      { 
        usedTrue: false
      }
    );

    // Activate the requested voucher
    const voucher = await Coupon.findOneAndUpdate(
      { _id: voucherId, businessId },
      { usedTrue: true },
      { new: true }
    );

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🚫'
      });
    }

    res.json({
      success: true,
      message: 'Voucher usage status updated! ✅',
      data: { voucher }
    });

  } catch (error) {
    console.error('Toggle voucher usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voucher status! 😢'
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
        isActive: true,
        usedTrue: true
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

    // Increment redemptions counter
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 
          'analytics.redemptions': 1,
          currentUsage: 1
        }
      }
    );

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
  getClaimedVoucher,
  toggleVoucherUsage
}; 