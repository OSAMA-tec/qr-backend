// Import dependencies 📦
const { createBusinessPass, createVoucherPass } = require('../services/appleWallet.service');
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const crypto = require('crypto');

// Create business pass 🎫
const generateBusinessPass = async (req, res) => {
  try {
    const businessId = req.params.businessId || req.user.userId;

    // Get business details
    const business = await User.findOne({
      _id: businessId,
      role: 'business'
    }).select('businessProfile firstName lastName email phoneNumber picUrl');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🔍'
      });
    }

    // Generate pass
    const pass = await createBusinessPass({
      businessName: business.businessProfile?.businessName || `${business.firstName} ${business.lastName}`,
      logo: business.picUrl,
      icon: business.picUrl,
      locationName: business.businessProfile?.location?.address,
      latitude: business.businessProfile?.location?.coordinates?.lat,
      longitude: business.businessProfile?.location?.coordinates?.lng,
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER
    });

    // Set response headers
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename=${business._id}.pkpass`
    });

    // Send pass file
    res.send(pass);

  } catch (error) {
    console.error('Generate business pass error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate business pass! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get voucher details 📋
const getVoucherDetails = async (req, res) => {
  try {
    const { businessId, voucherId } = req.params;

    // Get business details with picUrl
    const business = await User.findOne({
      _id: businessId,
      role: 'business'
    }).select('businessProfile firstName lastName picUrl email phoneNumber');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🔍'
      });
    }

    // Get voucher details
    const voucher = await Coupon.findOne({
      _id: voucherId,
      businessId
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    // Format discount text
    const discountText = voucher.discountType === 'percentage' 
      ? `${voucher.discountValue}% OFF`
      : `$${voucher.discountValue} OFF`;

    // Return formatted details with business info
    res.json({
      success: true,
      data: {
        business: {
          id: business._id,
          businessName: business.businessProfile?.businessName || `${business.firstName} ${business.lastName}`,
          email: business.email,
          phoneNumber: business.phoneNumber,
          picUrl: business.picUrl || null,
          location: business.businessProfile?.location || null
        },
        voucher: {
          id: voucher._id,
          title: voucher.title,
          description: voucher.description,
          discountText,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          expiryDate: voucher.endDate,
          minimumPurchase: voucher.minimumPurchase,
          maximumDiscount: voucher.maximumDiscount,
          code: voucher.code,
          qrCode: voucher.qrCode || null,
          isActive: voucher.isActive,
          startDate: voucher.startDate
        }
      }
    });

  } catch (error) {
    console.error('Get voucher details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get voucher details! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create voucher pass 🎟️
const generateVoucherPass = async (req, res) => {
  try {
    const { businessId, voucherId,userId } = req.params;

    // Get business details including logo (picUrl)
    const business = await User.findOne({
      _id: businessId,
      role: 'business'
    }).select('businessProfile firstName lastName picUrl');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🔍'
      });
    }

    // Get voucher details
    const voucher = await Coupon.findOne({
      _id: voucherId,
      businessId
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    // ============ OPTIMIZED QR DATA ============
    // Generate claim ID and create minimal QR data with short property names
    const claimId = crypto.randomBytes(16).toString('hex');
    const qrData = {
      id: claimId,                        // Claim ID
      v: voucherId.toString(),            // Voucher ID
      c: voucher.code,                    // Voucher code
      b: businessId.toString(),           // Business ID
      u: userId.toString(),               // User ID
      t: 'cv',                            // Type (claimed_voucher)
      ts: Math.floor(Date.now()/1000),    // Timestamp as unix epoch
      exp: Math.floor(new Date(voucher.endDate).getTime()/1000) // Expiry as unix epoch
    };

    // Generate secure hash using only critical fields for verification
    const securityString = `${claimId}|${voucherId}|${userId}|${businessId}|${Math.floor(new Date(voucher.endDate).getTime()/1000)}`;
    const hash = crypto
      .createHash('sha256')
      .update(securityString)
      .digest('hex');

    // Add hash to QR data
    qrData.h = hash;

    // Create the secure QR code string
    const secureQrCode = JSON.stringify(qrData);

    // Format discount text
    const discountText = voucher.discountType === 'percentage' 
      ? `${voucher.discountValue}% OFF`
      : `$${voucher.discountValue} OFF`;

    // Generate pass
    const passBuffer = await createVoucherPass({
      businessName: business.businessProfile?.businessName || `${business.firstName} ${business.lastName}`,
      voucherTitle: voucher.title,
      voucherCode: voucher.code,
      expiryDate: voucher.endDate,
      discountValue: voucher.discountValue,
      discountType: voucher.discountType,
      discountText: discountText,
      description: voucher.description,
      // Handle both URL and base64 image data
      logo: business.picUrl || business.businessProfile?.logo || null,
      icon: business.businessProfile?.icon || business.picUrl || null,
      locationName: business.businessProfile?.location?.address,
      latitude: business.businessProfile?.location?.coordinates?.lat,
      longitude: business.businessProfile?.location?.coordinates?.lng,
      minimumPurchase: voucher.minimumPurchase,
      maximumDiscount: voucher.maximumDiscount,
      secureQrCode // Pass the secure QR code data
    });

    // Set response headers for Apple Wallet
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename=${voucher.code}.pkpass`,
      'Content-Length': passBuffer.length,
      'Last-Modified': new Date().toUTCString(),
      'Cache-Control': 'no-cache'
    });

    // Send pass file
    res.send(passBuffer);

  } catch (error) {
    console.error('Generate voucher pass error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate voucher pass! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get pass QR code 📱
const getPassQRCode = async (req, res) => {
  try {
    const { businessId, voucherId } = req.params;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const passUrl = `${baseUrl}/api/wallet/apple/business/${businessId}/voucher/${voucherId}/pass`;

    // Generate QR code for the pass URL
    const QRCode = require('qrcode');
    const qrCodeDataUrl = await QRCode.toDataURL(passUrl);

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataUrl,
        passUrl
      }
    });

  } catch (error) {
    console.error('Get pass QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  generateBusinessPass,
  generateVoucherPass,
  getVoucherDetails,
  getPassQRCode
}; 