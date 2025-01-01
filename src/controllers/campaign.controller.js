// Import dependencies 📦
const Campaign = require('../models/campaign.model');
const CampaignLead = require('../models/campaignLead.model');
const User = require('../models/user.model');
const crypto = require('crypto');
const { detectDevice, parseUserAgent } = require('../utils/device.utils');
const { getLocationFromIP } = require('../utils/location.utils');

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
    const {
      name,
      type,
      description,
      startDate,
      endDate,
      formConfig,
      influencers
    } = req.body;

    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date! 📅'
      });
    }

    // Create referral links for influencers
    const referralLinks = influencers.map(influencer => ({
      code: generateReferralCode(name, influencer.name),
      influencerName: influencer.name,
      influencerType: influencer.type,
      platform: influencer.platform,
      customFields: influencer.customFields || {},
      analytics: {
        totalClicks: 0,
        uniqueClicks: 0,
        formViews: 0,
        formSubmissions: 0
      }
    }));

    // Process form fields to remove any empty IDs
    const processedFormConfig = {
      ...formConfig,
      fields: formConfig.fields.map(field => {
        // Remove _id if it's empty or undefined
        const { _id, ...fieldWithoutId } = field;
        return fieldWithoutId;
      }),
      theme: formConfig.theme || {
        primaryColor: "#007bff",
        backgroundColor: "#ffffff",
        textColor: "#333333"
      }
    };

    // Create campaign
    const campaign = new Campaign({
      businessId,
      name,
      type,
      description,
      startDate,
      endDate,
      formConfig: processedFormConfig,
      referralLinks,
      status: 'active'
    });

    await campaign.save();

    // Get base URL from environment or default
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully! 🎉',
      data: {
        campaignId: campaign._id,
        referralLinks: campaign.referralLinks.map(link => ({
          code: link.code,
          influencerName: link.influencerName,
          platform: link.platform,
          shareUrl: `${baseUrl}/ref/${link.code}` // URL to share
        }))
      }
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create campaign! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Initialize analytics object with safe defaults
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
      referralLinks: campaign.referralLinks.map(link => ({
        code: link.code,
        influencerName: link.influencerName,
        platform: link.platform,
        analytics: {
          totalClicks: link.analytics?.totalClicks || 0,
          uniqueClicks: link.analytics?.uniqueClicks || 0,
          formViews: link.analytics?.formViews || 0,
          formSubmissions: link.analytics?.formSubmissions || 0,
          conversionRate: link.analytics?.totalClicks ? 
            ((link.analytics.formSubmissions / link.analytics.totalClicks) * 100).toFixed(2) : 
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
      recentLeads: leads.slice(0, 5).map(lead => ({
        id: lead._id,
        email: lead.formData.email,
        name: `${lead.formData.firstName} ${lead.formData.lastName}`,
        submittedAt: lead.analytics.submissionTimestamp,
        referralCode: lead.referralCode,
        device: lead.analytics.deviceType
      }))
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get campaign analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign analytics! 😢'
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

module.exports = {
  createCampaign,
  trackCampaignClick,
  submitCampaignForm,
  getCampaignAnalytics,
  getAllCampaigns
}; 