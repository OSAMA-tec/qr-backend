// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const WidgetTemplate = require('../models/widgetTemplate.model');
const BusinessAnalytics = require('../models/businessAnalytics.model');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { detectDevice, parseUserAgent } = require('../utils/device.utils');

// Get voucher details 🎫
const getVoucherPopup = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Find active voucher with widget template
    const voucher = await Coupon.findOne({
      businessId,
      // isActive: true,
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
    const { firstName, lastName, email, phoneNumber, dateOfBirth } = req.body;
    const password = "12345";
    const userAgent = req.headers['user-agent'];

    // Check if user exists
    let user = await User.findOne({ email });
    let isNewUser = !user;
    
    if (user) {
      // Handle existing guest user
      if (user.isGuest) {
        // Check for existing claim for THIS voucher + business
        const existingClaim = user.voucherClaims.some(claim => 
          claim.voucherId.equals(voucher._id) &&
          claim.businessId.equals(businessId)
        );

        if (existingClaim) {
          return res.status(400).json({
            success: false,
            message: 'You already claimed this voucher! ❌'
          });
        }

        // Add new voucher claim
        user.voucherClaims.push({
          voucherId: voucher._id,
          businessId: businessId,
          claimMethod: 'popup',
          expiryDate: voucher.endDate,
          analytics: {
            clickDate: new Date(),
            viewDate: new Date()
          }
        });

        // Update guest details
        user.guestDetails.claimedFrom = 'popup';
        user.guestDetails.businessId = businessId;
        await user.save();
        isNewUser = false; // Maintain correct analytics tracking
      } else {
        return res.status(400).json({
          success: false,
          message: 'Email already registered! Please login to claim voucher. 📧'
        });
      }
    } else {
      // Create new guest user
      user = new User({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        role: 'customer',
        dateOfBirth: dateOfBirth,
        isVerified: false,
        guestDetails: {
          claimedFrom: 'popup',
          businessId: voucher.businessId
        },
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
      await user.save();
    }

    // Find active voucher
    const voucher = await Coupon.findOne({
      businessId,
      isActive: true,
      usedTrue: true,
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'No active voucher found! 🚫'
      });
    }

    // Update voucher analytics
    await Coupon.updateOne(
      { _id: voucher._id },
      { 
        $inc: { 
          'analytics.clicks': 1,
          currentUsage: 1
        }
      }
    );

    // Update business analytics 📈
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId });
    
    // Create analytics record if it doesn't exist
    if (!businessAnalytics) {
      businessAnalytics = new BusinessAnalytics({ businessId });
    }

    // Track new customer and source
    if (isNewUser) {
      await businessAnalytics.trackNewCustomer(true);
      await businessAnalytics.trackSource('popup');
    }

    // Track device info
    const deviceInfo = detectDevice(userAgent);
    await businessAnalytics.trackDevice(deviceInfo.type);

    // Track browser info
    const browserInfo = parseUserAgent(userAgent);
    await businessAnalytics.trackBrowser(browserInfo.browser);

    // Save analytics
    await businessAnalytics.save();

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
      }).populate('businessId', 'businessProfile')
    ]);

    if (!user || !voucher) {
      return res.status(404).json({
        success: false,
        message: 'Invalid claim details! 🚫'
      });
    }

    // ============ OPTIMIZED QR DATA ============
    // Create minimal QR data with short property names
    const qrData = {
      id: claimId,                        // Claim ID
      v: voucherId.toString(),            // Voucher ID
      c: voucher.code,                    // Voucher code
      b: voucher.businessId._id.toString(), // Business ID
      u: userId.toString(),               // User ID
      t: 'cv',                            // Type (claimed_voucher)
      ts: Math.floor(Date.now()/1000),    // Timestamp as unix epoch
      exp: Math.floor(new Date(voucher.endDate).getTime()/1000) // Expiry as unix epoch
    };

    // Generate secure hash using only critical fields for verification
    const securityString = `${claimId}|${voucherId}|${userId}|${voucher.businessId._id}|${Math.floor(new Date(voucher.endDate).getTime()/1000)}`;
    const hash = crypto
      .createHash('sha256')
      .update(securityString)
      .digest('hex');

    // Add hash to QR data
    qrData.h = hash;

    // Generate QR code with minimized data
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    // Update voucher analytics 📊
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 
          'analytics.redemptions': 1,
          'analytics.qrCodeGenerations': 1,
          currentUsage: 1
        },
        $push: {
          'qrHistory': {
            userId: user._id,
            generatedAt: new Date(),
            hash: hash
          }
        }
      }
    );

    // Update business analytics 📈
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId: voucher.businessId._id });
    
    if (businessAnalytics) {
      await businessAnalytics.trackQRScan();
      await businessAnalytics.save();
    }

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

    // Get business details from populated data 🏢
    const businessDetails = voucher.businessId.businessProfile || {};

    res.json({
      success: true,
      data: {
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          picUrl: user.picUrl || ''
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
          hash
        },
        business: {
          id: voucher.businessId._id,
          name: businessDetails.businessName || '',
          logo: businessDetails.logo || '',
          location: businessDetails.location || '',
          email: businessDetails.email || '',
          phone: businessDetails.phone || '',
          website: businessDetails.website || '',
          address: businessDetails.address || ''
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