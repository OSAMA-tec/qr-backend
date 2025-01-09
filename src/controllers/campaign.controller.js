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

    // Find campaign by referral code
    const campaign = await Campaign.findOne({
      'referralLinks.code': referralCode,
      status: 'active',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Get referral link index
    const linkIndex = campaign.referralLinks.findIndex(link => link.code === referralCode);
    
    // Update analytics
    campaign.referralLinks[linkIndex].analytics.totalClicks++;
    campaign.analytics.totalClicks++;

    // Track device and location
    const deviceInfo = detectDevice(userAgent);
    const browserInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(ipAddress);

    // Update device stats
    campaign.referralLinks[linkIndex].analytics.deviceStats[deviceInfo.type]++;
    campaign.analytics.deviceStats[deviceInfo.type]++;

    // Update browser stats
    const browserKey = browserInfo.browser.toLowerCase();
    campaign.referralLinks[linkIndex].analytics.browserStats.set(
      browserKey,
      (campaign.referralLinks[linkIndex].analytics.browserStats.get(browserKey) || 0) + 1
    );

    await campaign.save();

    // Return form configuration
    res.json({
      success: true,
      data: {
        formConfig: campaign.formConfig,
        campaignId: campaign._id,
        businessId: campaign.businessId
      }
    });
  } catch (error) {
    console.error('Track campaign click error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track campaign click! 😢'
    });
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
    const { status, page = 1, limit = 10 } = req.query;

    const query = { businessId };
    if (status) {
      query.status = status;
    }

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Campaign.countDocuments(query);

    // Get base URL from environment or default
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    res.json({
      success: true,
      data: {
        campaigns: campaigns.map(campaign => ({
          id: campaign._id,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          description: campaign.description,
          analytics: {
            totalClicks: campaign.analytics?.totalClicks || 0,
            formSubmissions: campaign.analytics?.formSubmissions || 0,
            conversionRate: campaign.analytics?.totalClicks ? 
              ((campaign.analytics.formSubmissions / campaign.analytics.totalClicks) * 100).toFixed(2) : 
              "0.00"
          },
          referralLinks: campaign.referralLinks?.map(link => ({
            code: link.code,
            influencerName: link.influencerName,
            platform: link.platform,
            isActive: link.isActive,
            shareUrl: `${baseUrl}/ref/${link.code}`, // URL to share
            customFields: link.customFields || {},
            analytics: {
              totalClicks: link.analytics?.totalClicks || 0,
              uniqueClicks: link.analytics?.uniqueClicks || 0,
              formSubmissions: link.analytics?.formSubmissions || 0,
              conversionRate: link.analytics?.totalClicks ? 
                ((link.analytics.formSubmissions / link.analytics.totalClicks) * 100).toFixed(2) : 
                "0.00"
            },
            createdAt: link.createdAt
          })) || [],
          totalLinks: campaign.referralLinks?.length || 0,
          formConfig: {
            fields: campaign.formConfig?.fields || [],
            theme: campaign.formConfig?.theme || {
              primaryColor: "#007bff",
              backgroundColor: "#ffffff",
              textColor: "#333333"
            }
          },
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt
        })),
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns! 😢'
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
            select: 'name category settings thumbnail isActive'
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