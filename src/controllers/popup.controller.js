// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const WidgetTemplate = require('../models/widgetTemplate.model');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

// Get voucher details & show get voucher button 🎫
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
      return res.render('error', {
        message: 'Voucher not found or expired! 🚫',
        layout: 'popup'
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

    // Render voucher details view
    res.render('voucher-details', {
      layout: 'popup',
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
    });
  } catch (error) {
    console.error('Get voucher popup error:', error);
    res.render('error', {
      message: 'Failed to load voucher details! 😢',
      layout: 'popup'
    });
  }
};

// Show registration form 📝
const getVoucherForm = async (req, res) => {
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
      return res.render('error', {
        message: 'Voucher not found or expired! 🚫',
        layout: 'popup'
      });
    }

    // Get widget settings
    const widgetSettings = voucher.businessId.businessProfile.widgetSettings || {};
    const templateSettings = voucher.widgetTemplateId?.settings || {};

    // Render registration form
    res.render('voucher-form', {
      layout: 'popup',
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
    });
  } catch (error) {
    console.error('Get voucher form error:', error);
    res.render('error', {
      message: 'Failed to load registration form! 😢',
      layout: 'popup'
    });
  }
};

// Register user and claim voucher 📝
const registerAndClaimVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      age,
      gender
    } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
      return res.render('voucher-form', {
        layout: 'popup',
        error: 'Email already registered! Please login to claim voucher. 📧',
        formData: req.body,
        voucherId // Pass voucherId back to form
      });
    }

    // Find voucher and business
    const voucher = await Coupon.findOne({
      _id: voucherId,
      isActive: true
    }).select('businessId');

    if (!voucher) {
      return res.render('error', {
        message: 'Voucher not found or inactive! 🚫',
        layout: 'popup'
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

    // Generate claim ID and redirect
    const claimId = crypto.randomBytes(16).toString('hex');
    res.redirect(`/api/popup/claimed-voucher/${claimId}?userId=${user._id}&voucherId=${voucherId}`);

  } catch (error) {
    console.error('Register and claim error:', error);
    res.render('voucher-form', {
      layout: 'popup',
      error: 'Registration failed! Please try again. 😢',
      formData: req.body,
      voucherId: req.params.voucherId // Pass voucherId back to form
    });
  }
};

// Get claimed voucher details and render 🎯
const getClaimedVoucher = async (req, res) => {
  try {
    const { claimId } = req.params;
    const { userId, voucherId } = req.query;

    // Get user, voucher and widget template
    const [user, voucher] = await Promise.all([
      User.findById(userId),
      Coupon.findOne({
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
      ])
    ]);

    if (!user || !voucher) {
      return res.render('error', {
        message: 'Invalid claim details! 🚫',
        layout: 'popup'
      });
    }

    // Generate QR code with widget template styling
    const template = voucher.widgetTemplateId;
    const qrStyle = template?.settings?.qrCode || {};
    
    const qrCodeData = await QRCode.toDataURL(JSON.stringify({
      code: voucher.code,
      businessId: voucher.businessId._id,
      userId: user._id,
      type: 'voucher'
    }), {
      color: {
        dark: qrStyle.darkColor || '#000000',
        light: qrStyle.lightColor || '#FFFFFF'
      },
      width: qrStyle.size || 300,
      margin: qrStyle.margin || 4,
      errorCorrectionLevel: qrStyle.errorCorrection || 'M'
    });

    // Increment clicks counter
    await Coupon.updateOne(
      { _id: voucherId },
      { $inc: { 'analytics.clicks': 1 } }
    );

    // Render claimed voucher view
    res.render('claimed-voucher', {
      layout: 'popup',
      voucher: {
        code: voucher.code,
        title: voucher.title,
        description: voucher.description,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        expiryDate: voucher.endDate,
        qrCode: qrCodeData
      },
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      business: {
        name: voucher.businessId.businessProfile.businessName,
        logo: voucher.businessId.businessProfile.logo
      },
      design: {
        ...template?.settings?.design,
        ...voucher.businessId.businessProfile.widgetSettings?.colors
      }
    });

  } catch (error) {
    console.error('Get claimed voucher error:', error);
    res.render('error', {
      message: 'Failed to load claimed voucher! 😢',
      layout: 'popup'
    });
  }
};

module.exports = {
  getVoucherPopup,
  getVoucherForm,
  registerAndClaimVoucher,
  getClaimedVoucher
}; 