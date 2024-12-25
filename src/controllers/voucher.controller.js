// Import dependencies 📦
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Create new voucher template 🎟️
const createVoucher = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const voucherData = req.body;

    // Generate unique code if not provided
    if (!voucherData.code) {
      voucherData.code = crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Create QR code
    const qrCodeData = await QRCode.toDataURL(JSON.stringify({
      code: voucherData.code,
      businessId,
      type: 'voucher'
    }));

    const voucher = new Coupon({
      ...voucherData,
      businessId,
      qrCode: {
        data: qrCodeData,
        url: `${process.env.BASE_URL}/voucher/${voucherData.code}`
      }
    });

    await voucher.save();

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully! 🎉',
      data: voucher
    });
  } catch (error) {
    console.error('Create voucher error:', error);
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

    // Add status filter
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

    // Add search filter
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const vouchers = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
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

    // Find and update voucher
    const voucher = await Coupon.findOneAndUpdate(
      {
        _id: voucherId,
        businessId,
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      },
      { $inc: { currentUsage: 1, 'analytics.redemptions': 1 } },
      { new: true }
    );

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired voucher! 🚫'
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (voucher.discountType === 'percentage') {
      discountAmount = (amount * voucher.discountValue) / 100;
      if (voucher.maximumDiscount) {
        discountAmount = Math.min(discountAmount, voucher.maximumDiscount);
      }
    } else if (voucher.discountType === 'fixed') {
      discountAmount = voucher.discountValue;
    }

    // Create transaction record
    const transaction = new Transaction({
      userId: customerId,
      businessId,
      voucherId,
      amount,
      discountAmount,
      location
    });

    await transaction.save();

    // Update analytics
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 'analytics.totalRevenue': amount },
        $set: { updatedAt: new Date() }
      }
    );

    res.json({
      success: true,
      message: 'Voucher redeemed successfully! 🎉',
      data: {
        transaction,
        discountAmount
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

module.exports = {
  createVoucher,
  listVouchers,
  getVoucherDetails,
  updateVoucher,
  deleteVoucher,
  toggleVoucherStatus,
  validateVoucher,
  redeemVoucher
}; 