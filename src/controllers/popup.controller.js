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
    const { firstName, lastName, email, phoneNumber, dateOfBirth, gender } = req.body;
    const password="12345"
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
      dateOfBirth: dateOfBirth,
      gender,
      isVerified: false,
      guestDetails: {
        claimedFrom: 'popup',
        businessId: voucher.businessId
      },
      // Add voucher claim details 🎫
      voucherClaims: [{
        voucherId: voucher._id,
        businessId: voucher.businessId,
        claimMethod: 'popup',
        expiryDate: voucher.endDate,
        analytics: {
          clickDate: new Date(),
          viewDate: new Date()
        }
      }]
    });

    // Generate verification token
    user.verificationToken = crypto.randomBytes(32).toString('hex');
    
    await user.save();

    // Increment clicks counter
    await Coupon.updateOne(
      { _id: voucher._id },
      { 
        $inc: { 
          'analytics.clicks': 1,
          currentUsage: 1
        }
      }
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

    // Get user and voucher details with more data 📝
    const [user, voucher] = await Promise.all([
      User.findById(userId),
      Coupon.findOne({
        _id: voucherId,
        isActive: true,
        // usedTrue: true
      }).populate('businessId', 'businessProfile businessId')
    ]);

    if (!user || !voucher) {
      return res.status(404).json({
        success: false,
        message: 'Invalid claim details! 🚫'
      });
    }

    // Create rich QR data object 🔐
    const qrData = {
      claimId,                    // Unique claim identifier
      voucherId: voucher._id,     // Voucher ID
      code: voucher.code,         // Voucher code
      businessId: voucher.businessId._id, // Business ID
      userId: user._id,           // User ID
      type: 'claimed_voucher',    // Type identifier
      timestamp: new Date(),      // Claim timestamp
      expiryDate: voucher.endDate // Expiry date
    };

    // Generate secure hash for verification 🔒
    const dataString = JSON.stringify(qrData);
    const hash = crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');

    // Add hash to QR data
    qrData.hash = hash;

    // Generate QR code with all data 📱
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    // Update voucher analytics 📊
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 
          'analytics.redemptions': 1,
          'analytics.qrCodeGenerations': 1, // New analytics field
          currentUsage: 1
        },
        $push: {
          'qrHistory': {  // Track QR code generation
            userId: user._id,
            generatedAt: new Date(),
            hash: hash
          }
        }
      }
    );

    // Update user's voucher claim status
    await User.updateOne(
      { 
        _id: userId,
        'voucherClaims.voucherId': voucherId 
      },
      {
        $set: {
          'voucherClaims.$.qrGenerated': true,
          'voucherClaims.$.qrGeneratedAt': new Date(),
          'voucherClaims.$.hash': hash
        }
      }
    );

    res.json({
      success: true,
      data: {
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber // Added phone
        },
        voucher: {
          id: voucher._id,
          title: voucher.title,
          description: voucher.description,
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          maximumDiscount: voucher.maximumDiscount,
          expiryDate: voucher.endDate,
          usageLimit: voucher.usageLimit,
          currentUsage: voucher.currentUsage,
          qrCode,
          hash  // Include hash for verification
        },
        business: {
          id: voucher.businessId._id,
          name: voucher.businessId.businessProfile.businessName,
          logo: voucher.businessId.businessProfile.logo,
          location: voucher.businessId.businessProfile.location
        },
        claim: {
          id: claimId,
          generatedAt: new Date(),
          status: 'active'
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