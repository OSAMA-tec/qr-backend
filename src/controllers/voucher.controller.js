// Import dependencies 📦
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const WidgetTemplate = require('../models/widgetTemplate.model');
const QRCode = require('qrcode');
const crypto = require('crypto');
const BusinessAnalytics = require('../models/businessAnalytics.model');
const mongoose = require('mongoose');
const Campaign = require('../models/campaign.model');

// Create new voucher template 🎟️
const createVoucher = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const voucherData = req.body;

    // ============ Validate Widget Template ============
    if (!voucherData.widgetTemplateId) {
      return res.status(400).json({
        success: false,
        message: 'Widget template ID is required! 🎨'
      });
    }

    const widgetTemplate = await WidgetTemplate.findOne({
      _id: voucherData.widgetTemplateId,
      isActive: true
    });

    if (!widgetTemplate) {
      return res.status(404).json({
        success: false,
        message: 'Widget template not found or inactive! 🚫'
      });
    }

    // ============ Process Dates ============
    // Convert string dates to Date objects
    const startDate = new Date(voucherData.startDate);
    const endDate = new Date(voucherData.endDate);
    
    // Validate dates
    const now = new Date();
    // if (startDate < now) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Start date must be in the future! ⚠️'
    //   });
    // }

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date! ⚠️'
      });
    }

    // ============ Generate Code and QR ============
    // Generate unique code if not provided
    if (!voucherData.code) {
      voucherData.code = crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Create QR code with widget template info
    const qrCodeData = await QRCode.toDataURL(JSON.stringify({
      code: voucherData.code,
      businessId,
      widgetTemplateId: voucherData.widgetTemplateId,
      type: 'voucher'
    }));

    // ============ Validate Discount Values ============
    // Convert string values to numbers
    const discountValue = parseFloat(voucherData.discountValue);
    const minimumPurchase = voucherData.minimumPurchase ? parseFloat(voucherData.minimumPurchase) : undefined;
    const maximumDiscount = voucherData.maximumDiscount ? parseFloat(voucherData.maximumDiscount) : undefined;

    if (voucherData.discountType === 'percentage' && discountValue > 100) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount cannot exceed 100%! 💯'
      });
    }

    // ============ Create Voucher ============
    // Create voucher with processed data
    const voucher = new Coupon({
      ...voucherData,
      businessId,
      startDate,  // Use processed Date object
      endDate,    // Use processed Date object
      discountValue,
      minimumPurchase,
      maximumDiscount,
      qrCode: {
        data: qrCodeData,
        url: `${process.env.BASE_URL}/voucher/${voucherData.code}`
      },
      // Initialize analytics
      analytics: {
        views: 0,
        clicks: 0,
        redemptions: 0,
        totalRevenue: 0,
        marketplace: {
          clicks: 0,
          submissions: 0,
          conversions: 0,
          ageDemographics: {
            under18: 0,
            eighteenTo25: 0,
            twenty6To35: 0,
            thirty6To50: 0,
            over50: 0
          }
        }
      },
      // Set initial status
      isActive: true,
      usedTrue: false,
      currentUsage: 0
    });

    // Save the voucher
    await voucher.save();

    // Populate response with widget template details
    await voucher.populate([
      {
        path: 'widgetTemplateId',
        select: 'name category settings'
      }
    ]);

    // Log the saved voucher for debugging
    console.log('Saved Voucher:', {
      startDate: voucher.startDate,
      endDate: voucher.endDate,
      // Log other relevant fields
      discountValue: voucher.discountValue,
      minimumPurchase: voucher.minimumPurchase,
      maximumDiscount: voucher.maximumDiscount
    });

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully! 🎉',
      data: voucher
    });

  } catch (error) {
    console.error('Create voucher error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

    // Handle duplicate code error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Voucher code already exists! Please try another code. 🔄'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create voucher! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// List all vouchers 📋
const listVouchers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { page = 1, limit = 10, status, search } = req.query;

    const query = { businessId };

    // Add status filter 🔍
    if (status && status !== 'all') {  // Only apply status filter if status is specified and not 'all'
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
    }

    // Add search filter 🔎
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get vouchers with widget template details 🎫
    const [voucherResults, totalCount] = await Promise.all([
      Coupon.find(query)
        .populate({
          path: 'widgetTemplateId',
          select: 'name category settings thumbnail isActive',
          match: { isActive: true }
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Coupon.countDocuments(query)
    ]);

    // Process vouchers to include status and widget info 📊
    const processedVouchers = voucherResults.map(voucher => {
      const voucherObj = voucher.toObject();
      
      // Calculate voucher status
      const now = new Date();
      let status = 'inactive';
      
      if (voucher.isActive) {
        if (now < voucher.startDate) {
          status = 'scheduled';
        } else if (now > voucher.endDate) {
          status = 'expired';
        } else {
          status = 'active';
        }
      }

      // Add widget template status
      if (voucherObj.widgetTemplateId) {
        voucherObj.widgetStatus = {
          isConnected: true,
          template: voucherObj.widgetTemplateId
        };
      } else {
        voucherObj.widgetStatus = {
          isConnected: false,
          message: 'No widget template connected or template is inactive! 🚫'
        };
      }

      // Add usage stats
      voucherObj.stats = {
        usagePercentage: voucher.usageLimit?.perCoupon 
          ? (voucher.currentUsage / voucher.usageLimit.perCoupon) * 100 
          : 0,
        remainingUses: voucher.usageLimit?.perCoupon 
          ? voucher.usageLimit.perCoupon - voucher.currentUsage 
          : 'unlimited',
        analytics: voucher.analytics,
        // Add marketplace analytics 🏪
        marketplaceAnalytics: {
          clicks: voucher.analytics?.marketplace?.clicks || 0,
          submissions: voucher.analytics?.marketplace?.submissions || 0,
          conversions: voucher.analytics?.marketplace?.conversions || 0,
          conversionRate: voucher.analytics?.marketplace?.submissions 
            ? ((voucher.analytics.marketplace.conversions / voucher.analytics.marketplace.submissions) * 100).toFixed(2) 
            : 0,
          demographics: {
            under18: voucher.analytics?.marketplace?.ageDemographics?.under18 || 0,
            eighteenTo25: voucher.analytics?.marketplace?.ageDemographics?.eighteenTo25 || 0,
            twenty6To35: voucher.analytics?.marketplace?.ageDemographics?.twenty6To35 || 0,
            thirty6To50: voucher.analytics?.marketplace?.ageDemographics?.thirty6To50 || 0,
            over50: voucher.analytics?.marketplace?.ageDemographics?.over50 || 0
          }
        }
      };

      return {
        ...voucherObj,
        status,
        timeRemaining: voucher.endDate > now 
          ? Math.ceil((voucher.endDate - now) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        vouchers: processedVouchers,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit)
        },
        summary: {
          total: totalCount,
          active: processedVouchers.filter(v => v.status === 'active').length,
          scheduled: processedVouchers.filter(v => v.status === 'scheduled').length,
          expired: processedVouchers.filter(v => v.status === 'expired').length,
          inactive: processedVouchers.filter(v => v.status === 'inactive').length
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

    // For activation, check if voucher dates are valid
    if (action === 'activate') {
      const voucher = await Coupon.findOne({ _id: id, businessId });
      
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Voucher not found! 🔍'
        });
      }

      // Check if voucher is expired
      const now = new Date();
      if (now > voucher.endDate) {
        return res.status(400).json({
          success: false,
          message: 'Cannot activate expired voucher! ⌛'
        });
      }
    }

    // Proceed with status update
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

// Helper function to generate unique reference number 🔢
const generateReferenceNumber = () => {
  // Format: VCH-TIMESTAMP-RANDOM
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `VCH-${timestamp}-${random}`;
};

// Redeem voucher 💫
const redeemVoucher = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { voucherId, customerId, amount, location } = req.body;
    const businessId = req.user.userId;

    // Find and validate voucher with business check 🎫
    const voucher = await Coupon.findOne({
      _id: voucherId,
      businessId,
    });

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired voucher! 🚫'
      });
    }

    // Check minimum purchase requirement 💰
    if (voucher.minimumPurchase && amount < voucher.minimumPurchase) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ${voucher.minimumPurchase} required! 💰`
      });
    }

    // Find user and validate voucher claim 👤
    const user = await User.findById(customerId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 👤'
      });
    }

    // Check if user has claimed this voucher
    const userClaim = user.voucherClaims.find(
      claim => claim.voucherId.toString() === voucherId && 
               claim.businessId.toString() === businessId &&
               claim.status === 'claimed'
    );

    if (!userClaim) {
      return res.status(400).json({
        success: false,
        message: 'User has not claimed this voucher! 🚫'
      });
    }

    // Check if voucher is already redeemed
    if (userClaim.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: 'Voucher already redeemed! 🔄'
      });
    }

    // Check if voucher has expired
    if (userClaim.expiryDate && new Date(userClaim.expiryDate) < new Date()) {
      // Update claim status to expired
      await User.updateOne(
        { 
          _id: customerId,
          'voucherClaims._id': userClaim._id 
        },
        { 
          $set: { 
            'voucherClaims.$.status': 'expired',
            'voucherClaims.$.updatedAt': new Date()
          }
        },
        { session }
      );

      return res.status(400).json({
        success: false,
        message: 'Voucher has expired! ⌛'
      });
    }

    // Calculate discount amount 💸
    let discountAmount = 0;
    if (voucher.discountType === 'percentage') {
      discountAmount = (amount * voucher.discountValue) / 100;
      if (voucher.maximumDiscount) {
        discountAmount = Math.min(discountAmount, voucher.maximumDiscount);
      }
    } else {
      discountAmount = Math.min(voucher.discountValue, amount);
    }

    // Create transaction record with reference number 📝
    const transaction = new Transaction({
      userId: customerId,
      businessId,
      voucherId,
      amount,
      discountAmount,
      location,
      status: 'completed',
      redeemedAt: new Date(),
      referenceNumber: generateReferenceNumber()
    });

    await transaction.save({ session });

    // Update user's voucher claim status ✅
    await User.updateOne(
      { 
        _id: customerId,
        'voucherClaims._id': userClaim._id 
      },
      { 
        $set: { 
          'voucherClaims.$.status': 'redeemed',
          'voucherClaims.$.redeemedDate': new Date(),
          'voucherClaims.$.analytics.redeemDate': new Date(),
          'voucherClaims.$.transactionId': transaction._id
        }
      },
      { session }
    );

    // Update voucher usage and analytics 📊
    await Coupon.updateOne(
      { _id: voucherId },
      { 
        $inc: { 
          currentUsage: 1,
          'analytics.redemptions': 1,
          'analytics.totalRevenue': amount,
          'analytics.totalDiscounts': discountAmount
        },
        $set: {
          usedTrue: true,
          updatedAt: new Date()
        }
      },
      { session }
    );

    // Update business analytics 📈
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId });
    
    // Create analytics record if it doesn't exist
    if (!businessAnalytics) {
      businessAnalytics = new BusinessAnalytics({ businessId });
    }

    // Track redemption and revenue
    await Promise.all([
      businessAnalytics.trackRedemption(),
      businessAnalytics.trackRevenue(amount)
    ]);

    // Save analytics
    await businessAnalytics.save({ session });

    // If voucher was claimed through campaign, update campaign analytics 🎯
    if (userClaim.source?.type === 'campaign' && userClaim.source.campaignId) {
      const campaign = await Campaign.findById(userClaim.source.campaignId);
      
      if (campaign) {
        // Initialize analytics if not exists
        if (!campaign.analytics) {
          campaign.analytics = {
            totalClicks: 0,
            uniqueClicks: 0,
            formViews: 0,
            formSubmissions: 0,
            conversions: 0,
            revenue: 0,
            deviceStats: {
              desktop: 0,
              mobile: 0,
              tablet: 0
            },
            browserStats: new Map(),
            locationStats: new Map(),
            timeStats: {
              hourly: Array(24).fill(0),
              daily: Array(7).fill(0),
              monthly: Array(12).fill(0)
            }
          };
        }

        // Update campaign revenue and conversion metrics
        campaign.analytics.revenue += amount;
        campaign.analytics.conversions++;
        
        // Calculate conversion rate
        if (campaign.analytics.totalClicks > 0) {
          campaign.analytics.conversionRate = 
            (campaign.analytics.conversions / campaign.analytics.totalClicks) * 100;
        }

        // Calculate average order value
        if (campaign.analytics.conversions > 0) {
          campaign.analytics.avgOrderValue = 
            campaign.analytics.revenue / campaign.analytics.conversions;
        }

        // Update influencer stats if referral code exists
        if (userClaim.source.referralCode) {
          const influencerIndex = campaign.influencers.findIndex(
            inf => inf.referralCode === userClaim.source.referralCode
          );

          if (influencerIndex !== -1) {
            campaign.influencers[influencerIndex].stats = {
              clicks: campaign.influencers[influencerIndex].stats?.clicks || 0,
              conversions: (campaign.influencers[influencerIndex].stats?.conversions || 0) + 1,
              revenue: (campaign.influencers[influencerIndex].stats?.revenue || 0) + amount
            };
          }
        }

        await campaign.save({ session });
      }
    }

    // Check if voucher has reached usage limit 🎯
    if (voucher.usageLimit?.perCoupon && voucher.currentUsage + 1 >= voucher.usageLimit.perCoupon) {
      await Coupon.updateOne(
        { _id: voucherId },
        { $set: { isActive: false } },
        { session }
      );
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Voucher redeemed successfully! 🎉',
      data: {
        transaction: {
          id: transaction._id,
          amount,
          discountAmount,
          finalAmount: amount - discountAmount,
          redeemedAt: transaction.redeemedAt,
          referenceNumber: transaction.referenceNumber
        },
        voucher: {
          id: voucher._id,
          code: voucher.code,
          title: voucher.title,
          discountApplied: {
            type: voucher.discountType,
            value: voucher.discountValue,
            calculatedAmount: discountAmount
          }
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
    await session.abortTransaction();
    console.error('Redeem voucher error:', error);
    
    // Handle specific error cases
    if (error.code === 11000) {
      // In the rare case of a duplicate reference number, retry once
      try {
        const newReferenceNumber = generateReferenceNumber();
        error.transaction.referenceNumber = newReferenceNumber;
        await error.transaction.save();
        
        return res.json({
          success: true,
          message: 'Voucher redeemed successfully! 🎉',
          data: {
            transaction: {
              id: error.transaction._id,
              amount: error.transaction.amount,
              discountAmount: error.transaction.discountAmount,
              finalAmount: error.transaction.amount - error.transaction.discountAmount,
              redeemedAt: error.transaction.redeemedAt,
              referenceNumber: newReferenceNumber
            }
          }
        });
      } catch (retryError) {
        console.error('Retry redeem voucher error:', retryError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to redeem voucher! 😢'
    });
  } finally {
    session.endSession();
  }
};

// Get claimed voucher users 👥
const getClaimedVoucherUsers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { search, page = 1, limit = 10, voucherCode } = req.query;

    // Build search query 🔍
    const query = {
      'voucherClaims.businessId': businessId
    };

    // If voucher code is provided, first find the voucher
    if (voucherCode) {
      const voucher = await Coupon.findOne({ 
        code: voucherCode.toUpperCase(),
        businessId 
      });

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Voucher not found! 🔍'
        });
      }

      // Add voucher ID to query
      query['voucherClaims.voucherId'] = voucher._id;
    }

    // Add search filter if provided 🎯
    if (search) {
      query.$or = [
        { email: new RegExp(search, 'i') },
        { phoneNumber: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') }
      ];
    }

    // Get users with pagination 📄
    const [users, totalCount] = await Promise.all([
      User.find(query)
        .select('firstName lastName email phoneNumber voucherClaims')
        .populate({
          path: 'voucherClaims.voucherId',
          select: 'title discountType discountValue code'
        })
        .sort({ 'voucherClaims.claimDate': -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Process user data 🔄
    const processedUsers = users.map(user => {
      const userData = user.toObject();
      
      // Filter voucher claims for this business and code if provided
      userData.voucherClaims = userData.voucherClaims.filter(claim => {
        const businessMatch = claim.businessId.toString() === businessId;
        const codeMatch = voucherCode ? 
          claim.voucherId?.code?.toUpperCase() === voucherCode.toUpperCase() : 
          true;
        return businessMatch && codeMatch;
      });

      // Add claim stats
      userData.claimStats = {
        totalClaims: userData.voucherClaims.length,
        redeemedClaims: userData.voucherClaims.filter(
          claim => claim.status === 'redeemed'
        ).length
      };

      return userData;
    });

    // Filter out users with no matching claims after processing
    const filteredUsers = processedUsers.filter(user => user.voucherClaims.length > 0);

    res.json({
      success: true,
      data: {
        users: filteredUsers,
        pagination: {
          total: filteredUsers.length,
          page: parseInt(page),
          pages: Math.ceil(filteredUsers.length / limit)
        },
        summary: {
          totalUsers: filteredUsers.length,
          activeUsers: filteredUsers.filter(
            user => user.voucherClaims.some(claim => claim.status === 'claimed')
          ).length,
          redeemedUsers: filteredUsers.filter(
            user => user.voucherClaims.some(claim => claim.status === 'redeemed')
          ).length
        }
      }
    });

  } catch (error) {
    console.error('Get claimed voucher users error:', error);
    res.status(500).json({
      success: false, 
      message: 'Failed to fetch claimed voucher users! 😢'
    });
  }
};

// Scan and validate QR code 📱
const scanVoucher = async (req, res) => {
  try {
    const businessId = req.user.userId;
    let qrData;
    
    // ============ GET QR DATA ============
    // Get raw QR data from request
    const rawQrData = req.parsedQrData || req.body.qrData || req.body;
    
    // ============ PARSE QR DATA ============
    // Handle both JSON and simple string formats
    if (typeof rawQrData === 'string') {
      // Try parsing as JSON first
      try {
        qrData = JSON.parse(rawQrData);
      } catch {
        // If not JSON, try parsing as simple string format (voucherId:userId)
        const [voucherId, userId] = rawQrData.split(':');
        if (voucherId && userId) {
          qrData = { v: voucherId, u: userId };
        }
      }
    } else {
      // Handle object format
      qrData = {
        v: rawQrData.v || rawQrData.voucherId,
        u: rawQrData.u || rawQrData.userId
      };
    }

    // Validate we have the minimum required data
    if (!qrData?.v || !qrData?.u) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format! 🚫'
      });
    }

    // ============ VALIDATE VOUCHER ============
    // Find voucher using voucherId
    const voucher = await Coupon.findById(qrData.v);

    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Voucher is invalid or expired! ⌛'
      });
    }

    // Check if voucher belongs to scanning business
    if (voucher.businessId.toString() !== businessId) {
      return res.status(403).json({
        success: false,
        message: 'This voucher is not valid for your business! 🏢'
      });
    }

    // Check if voucher has expired using database value
    const currentTime = new Date();
    if (currentTime > voucher.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Voucher has expired! ⌛'
      });
    }

    // ============ GET USER DETAILS ============
    // Fetch user details
    const user = await User.findById(qrData.u)
      .select('firstName lastName email phoneNumber');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 👤'
      });
    }

    // Return response with user details
    return res.json({
      success: true,
      data: {
        voucher: {
          id: voucher._id,
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          maximumDiscount: voucher.maximumDiscount,
          type: 'claimed_voucher',
          claimInfo: {
            userId: qrData.u,
            expiryDate: voucher.endDate
          }
        },
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber || null
        }
      }
    });

  } catch (error) {
    console.error('Scan voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan voucher! 😢'
    });
  }
};

// Add this new controller function
const toggleMarketplaceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.user.userId;

    const voucher = await Coupon.findOneAndUpdate(
      { _id: id, businessId },
      { $set: { marketplace: req.body.status } },
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
      message: `Marketplace status updated to ${voucher.marketplace ? 'active' : 'inactive'} ✅`,
      data: voucher
    });
  } catch (error) {
    console.error('Toggle marketplace error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update marketplace status 😢'
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
  redeemVoucher,
  getClaimedVoucherUsers,
  scanVoucher,
  toggleMarketplaceStatus
}; 