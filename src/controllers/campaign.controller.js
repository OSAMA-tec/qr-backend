// Import dependencies 📦
const Campaign = require('../models/campaign.model');
const CampaignLead = require('../models/campaignLead.model');
const User = require('../models/user.model');
const crypto = require('crypto');
const { detectDevice, parseUserAgent } = require('../utils/device.utils');
const { getLocationFromIP } = require('../utils/location.utils');
const Coupon = require('../models/coupon.model');
const mongoose = require('mongoose');

// Helper: Generate unique referral code 🎫
const generateReferralCode = (campaignId, influencerName) => {
  const timestamp = Date.now().toString(36);
  const hash = crypto.createHash('md5')
    .update(campaignId + influencerName + timestamp)
    .digest('hex')
    .substring(0, 6);
  return `${influencerName.substring(0, 3).toUpperCase()}-${hash}`.toUpperCase();
};

// Create campaign 🎯
const createCampaign = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const campaignData = req.body;

    // Validate voucher exists and belongs to business 🎫
    if (!campaignData.voucherId) {
      return res.status(400).json({
        success: false,
        message: 'Voucher ID is required! 🎫'
      });
    }

    // Validate voucherId format
    if (!mongoose.Types.ObjectId.isValid(campaignData.voucherId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid voucher ID format! Please provide a valid ID. 🚫'
      });
    }

    const voucher = await Coupon.findOne({
      _id: campaignData.voucherId,
      businessId,
      isActive: true
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found or inactive! 🚫'
      });
    }

    // Validate dates match voucher validity
    const campaignStart = new Date(campaignData.startDate);
    const campaignEnd = new Date(campaignData.endDate);
    const voucherStart = new Date(voucher.startDate);
    const voucherEnd = new Date(voucher.endDate);

    if (campaignStart < voucherStart || campaignEnd > voucherEnd) {
      return res.status(400).json({
        success: false,
        message: 'Campaign dates must be within voucher validity period! ⚠️',
        data: {
          voucherValidity: {
            start: voucherStart,
            end: voucherEnd
          }
        }
      });
    }

    // Process form config
    if (campaignData.formConfig) {
      campaignData.formConfig.fields = campaignData.formConfig.fields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.isRequired || false,
        options: field.options || []
      }));
    }

    // Create campaign with voucher reference 🎯
    const campaign = new Campaign({
      ...campaignData,
      businessId,
      status: 'draft' // Always start as draft
    });

    await campaign.save();

    // Populate response with voucher details 🔍
    await campaign.populate([
      {
        path: 'voucherId',
        select: 'code title description discountType discountValue startDate endDate',
        populate: {
          path: 'widgetTemplateId',
          select: 'name category settings'
        }
      }
    ]);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully! 🎉',
      data: {
        campaign,
        shareUrls: campaign.influencers.map(inf => ({
          name: inf.name,
          platform: inf.platform,
          referralCode: inf.referralCode,
          shareUrl: `${process.env.BASE_URL}/ref/${inf.referralCode}`
        }))
      }
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    
    // Handle validation errors ❌
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

    // Handle cast errors (invalid ObjectId)
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path} format! Please provide a valid ID. 🚫`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create campaign! 😢'
    });
  }
};

// Track campaign click 🖱️
const trackCampaignClick = async (req, res) => {
  try {
    const { referralCode } = req.params;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    // Find campaign by referral code 🔍
    const campaign = await Campaign.findOne({
      'influencers.referralCode': referralCode,
      // status: 'active',
      // startDate: { $lte: new Date() },
      // endDate: { $gte: new Date() }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Get influencer index 👤
    const influencerIndex = campaign.influencers.findIndex(inf => inf.referralCode === referralCode);
    
    if (influencerIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code! 🚫'
      });
    }

    // Track device and location info 📱
    const deviceInfo = detectDevice(userAgent);
    const browserInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(ipAddress);

    // Update influencer stats 📊
    campaign.influencers[influencerIndex].stats.clicks++;
    
    // Update campaign analytics 📈
    campaign.analytics.totalClicks = (campaign.analytics.totalClicks || 0) + 1;
    campaign.analytics.uniqueClicks = (campaign.analytics.uniqueClicks || 0) + 1;

    // Track device stats 📱
    if (!campaign.analytics.deviceStats) {
      campaign.analytics.deviceStats = {
        desktop: 0,
        mobile: 0,
        tablet: 0
      };
    }
    campaign.analytics.deviceStats[deviceInfo.type]++;

    // Track browser stats 🌐
    if (!campaign.analytics.browserStats) {
      campaign.analytics.browserStats = new Map();
    }
    const browserKey = browserInfo.browser.toLowerCase();
    campaign.analytics.browserStats.set(
      browserKey,
      (campaign.analytics.browserStats.get(browserKey) || 0) + 1
    );

    // Track location stats 🌍
    if (!campaign.analytics.locationStats) {
      campaign.analytics.locationStats = new Map();
    }
    if (location.country) {
      const locationKey = location.country.toLowerCase();
      campaign.analytics.locationStats.set(
        locationKey,
        (campaign.analytics.locationStats.get(locationKey) || 0) + 1
      );
    }

    // Track time stats ⏰
    if (!campaign.analytics.timeStats) {
      campaign.analytics.timeStats = {
        hourly: Array(24).fill(0),
        daily: Array(7).fill(0),
        monthly: Array(12).fill(0)
      };
    }
    const now = new Date();
    campaign.analytics.timeStats.hourly[now.getHours()]++;
    campaign.analytics.timeStats.daily[now.getDay()]++;
    campaign.analytics.timeStats.monthly[now.getMonth()]++;

    // Save all updates 💾
    await campaign.save();

    // Get voucher details for form 🎫
    const voucher = await Coupon.findById(campaign.voucherId)
      .select('code title description discountType discountValue minimumPurchase');

    // Prepare response data 📦
    const responseData = {
      formConfig: campaign.formConfig || {
        fields: [
          { name: 'firstName', type: 'text', required: true },
          { name: 'lastName', type: 'text', required: true },
          { name: 'email', type: 'email', required: true },
          { name: 'phoneNumber', type: 'phone', required: false }
        ]
      },
      campaign: {
        id: campaign._id,
        name: campaign.name,
        type: campaign.type,
        voucher: voucher ? {
          code: voucher.code,
          title: voucher.title,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase
        } : null
      },
      tracking: {
        deviceType: deviceInfo.type,
        browser: browserInfo.browser,
        os: browserInfo.os,
        location: location,
        timestamp: now,
        referralCode: referralCode
      }
    };
    console.log(responseData)
    // Encode the data as base64 🔐
    const token = Buffer.from(JSON.stringify(responseData)).toString('base64');

    // Redirect to claim page with token 🔄
    const claimUrl = `http://localhost:5173/campaign/claim?token=${token}`;
    res.redirect(claimUrl);

  } catch (error) {
    console.error('Track campaign click error:', error);
    // In case of error, redirect to error page
    res.redirect(`http://localhost:5173/campaign/error?message=${encodeURIComponent('Failed to process campaign link! 😢')}`);
  }
};

// Submit campaign form 📝
const submitCampaignForm = async (req, res) => {
  try {
    const { campaignId, referralCode, formData } = req.body;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    // Find campaign
    const campaign = await Campaign.findOne({
      _id: campaignId,
      'referralLinks.code': referralCode,
      status: 'active'
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Check if email already exists
    const existingLead = await CampaignLead.findOne({
      campaignId,
      'formData.email': formData.email
    });

    if (existingLead) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted this form! 📝'
      });
    }

    // Get device and location info
    const deviceInfo = detectDevice(userAgent);
    const browserInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(ipAddress);

    // Create or update user
    let user = await User.findOne({ email: formData.email });
    if (!user) {
      user = new User({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber,
        dateOfBirth: formData.dateOfBirth,
        role: 'customer',
        isGuest: true
      });
      await user.save();
    }

    // Create lead
    const lead = new CampaignLead({
      campaignId,
      referralCode,
      businessId: campaign.businessId,
      userId: user._id,
      formData,
      analytics: {
        deviceType: deviceInfo.type,
        browser: browserInfo.browser,
        os: browserInfo.os,
        ipAddress,
        location,
        referrer: req.headers.referer,
        formFillTime: req.body.formFillTime,
        clickTimestamp: req.body.clickTimestamp,
        formViewTimestamp: req.body.formViewTimestamp
      }
    });

    await lead.save();

    // Update campaign analytics
    const linkIndex = campaign.referralLinks.findIndex(link => link.code === referralCode);
    campaign.referralLinks[linkIndex].analytics.formSubmissions++;
    campaign.analytics.formSubmissions++;
    
    // Calculate conversion rate
    campaign.referralLinks[linkIndex].analytics.conversionRate = 
      (campaign.referralLinks[linkIndex].analytics.formSubmissions / 
       campaign.referralLinks[linkIndex].analytics.totalClicks) * 100;

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully! 🎉',
      data: {
        leadId: lead._id,
        userId: user._id
      }
    });
  } catch (error) {
    console.error('Submit campaign form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit form! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get campaign analytics 📊
const getCampaignAnalytics = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const businessId = req.user.userId;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found! 🔍'
      });
    }

    // Get leads for detailed analytics
    const leads = await CampaignLead.find({
      campaignId,
      businessId
    }).select('-formData.customFields');

    // Initialize analytics object with safe defaults 🔄
    const analytics = {
      overview: {
        totalClicks: campaign.analytics?.totalClicks || 0,
        uniqueClicks: campaign.analytics?.uniqueClicks || 0,
        formViews: campaign.analytics?.formViews || 0,
        formSubmissions: campaign.analytics?.formSubmissions || 0,
        conversionRate: campaign.analytics?.totalClicks ? 
          ((campaign.analytics.formSubmissions / campaign.analytics.totalClicks) * 100).toFixed(2) : 
          "0.00",
        averageFormFillTime: campaign.analytics?.averageFormFillTime || 0
      },
      // Safely handle referralLinks array 🔍
      referralLinks: (campaign.influencers || []).map(link => ({
        code: link.referralCode || '',
        influencerName: link.name || '',
        platform: link.platform || '',
        analytics: {
          totalClicks: link.stats?.clicks || 0,
          uniqueClicks: link.stats?.uniqueClicks || 0,
          formViews: link.stats?.formViews || 0,
          formSubmissions: link.stats?.conversions || 0,
          conversionRate: link.stats?.clicks ? 
            ((link.stats.conversions / link.stats.clicks) * 100).toFixed(2) : 
            "0.00"
        }
      })),
      deviceBreakdown: campaign.analytics?.deviceStats || {
        desktop: 0,
        mobile: 0,
        tablet: 0
      },
      browserStats: campaign.analytics?.browserStats ? 
        Object.fromEntries(campaign.analytics.browserStats) : 
        {},
      locationStats: campaign.analytics?.locationStats ? 
        Object.fromEntries(campaign.analytics.locationStats) : 
        {},
      timeStats: campaign.analytics?.timeStats || {
        hourly: Array(24).fill(0),
        daily: Array(7).fill(0),
        monthly: Array(12).fill(0)
      },
      // Safely handle leads array 📊
      recentLeads: (leads || []).slice(0, 5).map(lead => ({
        id: lead._id,
        email: lead.formData?.email || '',
        name: `${lead.formData?.firstName || ''} ${lead.formData?.lastName || ''}`.trim(),
        submittedAt: lead.analytics?.submissionTimestamp || lead.createdAt,
        referralCode: lead.referralCode || '',
        device: lead.analytics?.deviceType || 'unknown'
      }))
    };

    // Add summary stats 📈
    analytics.summary = {
      totalLeads: leads.length,
      conversionRate: analytics.overview.conversionRate,
      topPlatforms: analytics.referralLinks.reduce((acc, link) => {
        if (link.platform) {
          acc[link.platform] = (acc[link.platform] || 0) + link.analytics.formSubmissions;
        }
        return acc;
      }, {}),
      deviceDistribution: analytics.deviceBreakdown
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get campaign analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign analytics! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all campaigns 📋
const getAllCampaigns = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { status, page = 1, limit = 10, search } = req.query;

    // Build query 🔍
    const query = { businessId };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get campaigns with populated data 📦
    const campaigns = await Campaign.find(query)
      .populate({
        path: 'voucherId',
        select: 'code title description discountType discountValue startDate endDate isActive',
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Campaign.countDocuments(query);

    // Process campaigns with proper data structure 🏗️
    const processedCampaigns = campaigns.map(campaign => {
      const now = new Date();
      
      // Calculate campaign status ⏱️
      let currentStatus = campaign.status;
      if (currentStatus === 'active') {
        if (now < campaign.startDate) {
          currentStatus = 'scheduled';
        } else if (now > campaign.endDate) {
          currentStatus = 'completed';
        }
      }

      // Process influencer links with API endpoint format 🔗
      const influencerLinks = campaign.influencers.map(inf => ({
        id: inf._id,
        name: inf.name,
        type: inf.type,
        platform: inf.platform,
        referralCode: inf.referralCode,
        // Format link as API endpoint
        referralLink: `http://localhost:3000/api/campaigns/click/${inf.referralCode}`,
        stats: {
          clicks: inf.stats?.clicks || 0,
          conversions: inf.stats?.conversions || 0,
          revenue: inf.stats?.revenue || 0,
          conversionRate: inf.stats?.clicks ? 
            ((inf.stats.conversions / inf.stats.clicks) * 100).toFixed(2) : 
            "0.00"
        }
      }));

      // Format voucher info 🎫
      const voucherInfo = campaign.voucherId ? {
        id: campaign.voucherId._id,
        code: campaign.voucherId.code,
        title: campaign.voucherId.title,
        description: campaign.voucherId.description,
        discountType: campaign.voucherId.discountType,
        discountValue: campaign.voucherId.discountValue,
        isActive: campaign.voucherId.isActive,
        startDate: campaign.voucherId.startDate,
        endDate: campaign.voucherId.endDate
      } : null;

      // Calculate performance metrics 📊
      const performance = {
        totalClicks: campaign.analytics?.totalClicks || 0,
        uniqueClicks: campaign.analytics?.uniqueClicks || 0,
        conversions: campaign.analytics?.conversions || 0,
        revenue: campaign.analytics?.revenue || 0,
        conversionRate: campaign.analytics?.uniqueClicks ? 
          ((campaign.analytics.conversions / campaign.analytics.uniqueClicks) * 100).toFixed(2) : 
          "0.00",
        avgOrderValue: campaign.analytics?.conversions ? 
          (campaign.analytics.revenue / campaign.analytics.conversions).toFixed(2) : 
          "0.00"
      };

      return {
        id: campaign._id,
        name: campaign.name,
        description: campaign.description,
        type: campaign.type,
        status: currentStatus,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        voucher: voucherInfo,
        influencers: influencerLinks,
        performance,
        budget: {
          total: campaign.budget?.total || 0,
          spent: campaign.budget?.spent || 0,
          remaining: campaign.budget?.remaining || 0
        },
        timeRemaining: campaign.endDate > now ? 
          Math.ceil((campaign.endDate - now) / (1000 * 60 * 60 * 24)) : 
          0,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt
      };
    });

    // Return formatted response 📬
    res.json({
      success: true,
      message: 'Campaigns retrieved successfully! 🎉',
      data: {
        campaigns: processedCampaigns,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        },
        summary: {
          total,
          active: processedCampaigns.filter(c => c.status === 'active').length,
          scheduled: processedCampaigns.filter(c => c.status === 'scheduled').length,
          completed: processedCampaigns.filter(c => c.status === 'completed').length,
          paused: processedCampaigns.filter(c => c.status === 'paused').length
        }
      }
    });
  } catch (error) {
    console.error('Get all campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// List all campaigns 📋
const listCampaigns = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { page = 1, limit = 10, status, type, search } = req.query;

    const query = { businessId };

    // Add filters 🔍
    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    // Get campaigns with voucher and widget details 🎯
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate({
          path: 'voucherId',
          select: 'code title description discountType discountValue startDate endDate isActive',
          populate: {
            path: 'widgetTemplateId',
            select: 'name category  thumbnail isActive'
          }
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Campaign.countDocuments(query)
    ]);

    // Process campaigns to include status and stats 📊
    const processedCampaigns = campaigns.map(campaign => {
      const campaignObj = campaign.toObject();
      
      // Calculate campaign status
      const now = new Date();
      let status = campaign.status;
      
      if (status === 'active') {
        if (now < campaign.startDate) {
          status = 'scheduled';
        } else if (now > campaign.endDate) {
          status = 'completed';
        }
      }

      // Add voucher status
      if (campaignObj.voucherId) {
        campaignObj.voucherStatus = {
          isActive: campaignObj.voucherId.isActive,
          isExpired: new Date(campaignObj.voucherId.endDate) < now,
          timeRemaining: new Date(campaignObj.voucherId.endDate) > now 
            ? Math.ceil((new Date(campaignObj.voucherId.endDate) - now) / (1000 * 60 * 60 * 24))
            : 0
        };
      }

      // Calculate performance metrics
      const performance = {
        conversionRate: campaignObj.analytics.uniqueClicks > 0
          ? (campaignObj.analytics.conversions / campaignObj.analytics.uniqueClicks) * 100
          : 0,
        roi: campaignObj.budget.spent > 0
          ? ((campaignObj.analytics.revenue - campaignObj.budget.spent) / campaignObj.budget.spent) * 100
          : 0
      };

      return {
        ...campaignObj,
        status,
        performance,
        timeRemaining: campaign.endDate > now 
          ? Math.ceil((campaign.endDate - now) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    res.json({
      success: true,
      data: {
        campaigns: processedCampaigns,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        },
        summary: {
          total,
          active: processedCampaigns.filter(c => c.status === 'active').length,
          scheduled: processedCampaigns.filter(c => c.status === 'scheduled').length,
          completed: processedCampaigns.filter(c => c.status === 'completed').length,
          paused: processedCampaigns.filter(c => c.status === 'paused').length,
          cancelled: processedCampaigns.filter(c => c.status === 'cancelled').length
        }
      }
    });
  } catch (error) {
    console.error('List campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns! 😢'
    });
  }
};

module.exports = {
  createCampaign,
  trackCampaignClick,
  submitCampaignForm,
  getCampaignAnalytics,
  getAllCampaigns,
  listCampaigns
}; 