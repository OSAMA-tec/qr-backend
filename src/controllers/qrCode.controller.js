// Import dependencies 📦
const QRCode = require('qrcode');
const crypto = require('crypto');
const Coupon = require('../models/coupon.model');
const Transaction = require('../models/transaction.model');

// Generate new QR code 🎨
const generateQRCode = async (req, res) => {
  try {
    const { voucherId, metadata = {} } = req.body;
    const businessId = req.user.userId;

    // Check if voucher exists and belongs to business
    const voucher = await Coupon.findOne({ _id: voucherId, businessId });
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    // Generate unique code
    const uniqueCode = crypto.randomBytes(6).toString('hex').toUpperCase();

    // Create QR code data
    const qrData = {
      code: uniqueCode,
      voucherId: voucher._id,
      businessId,
      type: 'voucher',
      metadata,
      generatedAt: new Date()
    };

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrData));

    // Update voucher with QR code
    await Coupon.findByIdAndUpdate(voucherId, {
      $push: {
        qrCodes: {
          code: uniqueCode,
          data: qrCodeImage,
          metadata
        }
      }
    });

    res.json({
      success: true,
      message: 'QR code generated successfully! 🎉',
      data: {
        code: uniqueCode,
        qrCode: qrCodeImage,
        voucherId: voucher._id
      }
    });
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code! 😢'
    });
  }
};

// Get QR code details 🔍
const getQRCodeDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.userId;

    const voucher = await Coupon.findOne({
      'qrCodes.code': id,
      businessId
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found! 🔍'
      });
    }

    const qrCode = voucher.qrCodes.find(qr => qr.code === id);

    // Get scan history
    const scans = await Transaction.find({
      'qrCode.code': id
    })
    .populate('userId', 'firstName lastName email')
    .select('userId createdAt location status')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        qrCode,
        voucher: {
          id: voucher._id,
          title: voucher.title,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue
        },
        scans
      }
    });
  } catch (error) {
    console.error('Get QR code details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch QR code details! 😢'
    });
  }
};

// Generate multiple QR codes 🎯
const bulkGenerateQRCodes = async (req, res) => {
  try {
    const { voucherId, quantity, metadata = {} } = req.body;
    const businessId = req.user.userId;

    // Check if voucher exists and belongs to business
    const voucher = await Coupon.findOne({ _id: voucherId, businessId });
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🔍'
      });
    }

    const qrCodes = [];
    const bulkQRCodes = [];

    // Generate specified quantity of QR codes
    for (let i = 0; i < quantity; i++) {
      const uniqueCode = crypto.randomBytes(6).toString('hex').toUpperCase();
      
      // Create QR code data
      const qrData = {
        code: uniqueCode,
        voucherId: voucher._id,
        businessId,
        type: 'voucher',
        metadata,
        generatedAt: new Date()
      };

      // Generate QR code image
      const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrData));

      qrCodes.push({
        code: uniqueCode,
        qrCode: qrCodeImage
      });

      bulkQRCodes.push({
        code: uniqueCode,
        data: qrCodeImage,
        metadata
      });
    }

    // Update voucher with all QR codes
    await Coupon.findByIdAndUpdate(voucherId, {
      $push: {
        qrCodes: { $each: bulkQRCodes }
      }
    });

    res.json({
      success: true,
      message: `${quantity} QR codes generated successfully! 🎉`,
      data: {
        voucherId: voucher._id,
        qrCodes
      }
    });
  } catch (error) {
    console.error('Bulk generate QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR codes! 😢'
    });
  }
};

// Validate QR code 🔍
const validateQRCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { businessId } = req.query;

    const voucher = await Coupon.findOne({
      'qrCodes.code': code,
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired QR code! 🚫'
      });
    }

    const qrCode = voucher.qrCodes.find(qr => qr.code === code);

    // Check if QR code has been used (if single-use)
    if (voucher.qrCodeUsageType === 'single-use' && qrCode.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'QR code has already been used! 🚫'
      });
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
    console.error('Validate QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate QR code! 😢'
    });
  }
};

// Process QR code scan 📱
const processQRCodeScan = async (req, res) => {
  try {
    const { code, location, deviceInfo } = req.body;
    const businessId = req.user.userId;

    const voucher = await Coupon.findOne({
      'qrCodes.code': code,
      businessId,
      isActive: true
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code! 🚫'
      });
    }

    // Record scan in transaction history
    const transaction = new Transaction({
      businessId,
      voucherId: voucher._id,
      qrCode: {
        code,
        scannedAt: new Date()
      },
      location,
      deviceInfo,
      status: 'scanned'
    });

    await transaction.save();

    // Update QR code usage count
    await Coupon.updateOne(
      { 'qrCodes.code': code },
      { 
        $inc: { 'qrCodes.$.usageCount': 1 },
        $set: { 
          'qrCodes.$.lastScannedAt': new Date(),
          'qrCodes.$.lastLocation': location
        }
      }
    );

    res.json({
      success: true,
      message: 'QR code scan processed successfully! 🎉',
      data: {
        transaction,
        voucher: {
          id: voucher._id,
          title: voucher.title,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue
        }
      }
    });
  } catch (error) {
    console.error('Process QR code scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process QR code scan! 😢'
    });
  }
};

module.exports = {
  generateQRCode,
  getQRCodeDetails,
  bulkGenerateQRCodes,
  validateQRCode,
  processQRCodeScan
}; 