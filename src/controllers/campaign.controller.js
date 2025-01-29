// Import dependencies 📦
const Campaign = require('../models/campaign.model');
const CampaignLead = require('../models/campaignLead.model');
const User = require('../models/user.model');
const crypto = require('crypto');
const { detectDevice, parseUserAgent } = require('../utils/device.utils');
const { getLocationFromIP } = require('../utils/location.utils');
const Coupon = require('../models/coupon.model');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const BusinessAnalytics = require('../models/businessAnalytics.model');

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
      // isActive: true
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

    // if (campaignStart < voucherStart || campaignEnd > voucherEnd) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Campaign dates must be within voucher validity period! ⚠️',
    //     data: {
    //       voucherValidity: {
    //         start: voucherStart,
    //         end: voucherEnd
    //       }
    //     }
    //   });
    // }

    // Process form config
    if (campaignData.formConfig) {
      campaignData.formConfig.fields = campaignData.formConfig.fields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.isRequired || false,
        options: field.options || []
      }));
    }

    // Create campaign with voucher reference 🎯 //
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { referralCode } = req.params;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    // Find campaign by referral code 🔍
    const campaign = await Campaign.findOne({
      'influencers.referralCode': referralCode,
    }).populate('businessId', 'businessProfile email');

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

    // Track click analytics using model method
    campaign.trackClick(deviceInfo, browserInfo, location);

    // Save all updates with session
    await campaign.save({ session });

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
        businessId: campaign.businessId._id,
        business: {
          id: campaign.businessId._id,
          email: campaign.businessId.email,
          businessName: campaign.businessId.businessProfile?.businessName,
          logo: campaign.businessId.businessProfile?.logo,
          description: campaign.businessId.businessProfile?.description,
          location: campaign.businessId.businessProfile?.location
        },
        question: campaign.question || null,
        voucher: voucher ? {
          code: voucher.code,
          title: voucher.title,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          question: voucher.question || null
        } : null
      },
      tracking: {
        deviceType: deviceInfo.type,
        browser: browserInfo.browser,
        os: browserInfo.os,
        location: location,
        timestamp: new Date(),
        referralCode: referralCode
      }
    };

    await session.commitTransaction();

    // Encode the data as base64 🔐
    const token = Buffer.from(JSON.stringify(responseData)).toString('base64');

    // Redirect to claim page with token 🔄
    const claimUrl = `${process.env.CLIENT_URL}/campaign/claim?token=${token}`;
    res.redirect(claimUrl);

  } catch (error) {
    await session.abortTransaction();
    console.error('Track campaign click error:', error);
    // In case of error, redirect to error page
    res.redirect(`${process.env.CLIENT_URL}/campaign/error?message=${encodeURIComponent('Failed to process campaign link! 😢')}`);
  } finally {
    session.endSession();
  }
};

// Submit campaign form 📝
const submitCampaignForm = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { campaignId, referralCode, formData } = req.body;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    // Find campaign and get influencer info 🎯
    const campaign = await Campaign.findOne({
      _id: campaignId,
      'influencers.referralCode': referralCode,
    }).populate('voucherId');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Get influencer details 👤
    const influencer = campaign.influencers.find(inf => inf.referralCode === referralCode);
    
    if (!influencer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code! 🚫'
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

    // Get device and location info 📱
    const deviceInfo = detectDevice(userAgent);
    const browserInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(ipAddress);

    // Track form submission analytics
    campaign.trackFormSubmission(
      deviceInfo, 
      browserInfo, 
      location,
      req.body.formFillTime
    );

    // Create or update user with campaign source info 👤
    let user = await User.findOne({ email: formData.email });
    const isNewUser = !user;

    if (!user) {
      user = new User({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber,
        dateOfBirth: formData.dateOfBirth,
        role: 'customer',
        isGuest: true,
        guestDetails: {
          description: `Joined via ${campaign.name} campaign`,
          claimedFrom: 'campaign',
          businessId: campaign.businessId,
          source: {
            type: 'campaign',
            campaignId: campaign._id,
            campaignName: campaign.name,
            influencerId: influencer._id,
            influencerName: influencer.name,
            influencerPlatform: influencer.platform,
            referralCode: referralCode,
            joinedAt: new Date()
          }
        },
        voucherClaims: [{
          voucherId: campaign.voucherId._id,
          businessId: campaign.businessId,
          claimMethod: 'link',
          expiryDate: campaign.voucherId.endDate,
          analytics: {
            clickDate: new Date(),
            viewDate: new Date(),
            source: {
              type: 'campaign',
              campaignId: campaign._id,
              influencerId: influencer._id,
              referralCode: referralCode
            }
          }
        }]
      });
      await user.save({ session });
    } else {
      const existingClaim = user.voucherClaims?.find(
        claim => claim.voucherId.toString() === campaign.voucherId._id.toString()
      );

      if (!existingClaim) {
        await User.updateOne(
          { _id: user._id },
          {
            $push: {
              voucherClaims: {
                voucherId: campaign.voucherId._id,
                businessId: campaign.businessId,
                claimMethod: 'link',
                expiryDate: campaign.voucherId.endDate,
                analytics: {
                  clickDate: new Date(),
                  viewDate: new Date(),
                  source: {
                    type: 'campaign',
                    campaignId: campaign._id,
                    influencerId: influencer._id,
                    referralCode: referralCode
                  }
                }
              }
            }
          },
          { session }
        );
      }
    }

    // Create lead with enhanced tracking 📊
    const lead = new CampaignLead({
      campaignId,
      referralCode,
      businessId: campaign.businessId,
      userId: user._id,
      formData,
      influencerDetails: {
        id: influencer._id,
        name: influencer.name,
        platform: influencer.platform,
        type: influencer.type
      },
      analytics: {
        deviceType: deviceInfo.type,
        browser: browserInfo.browser,
        os: browserInfo.os,
        ipAddress,
        location,
        referrer: req.headers.referer,
        formFillTime: req.body.formFillTime,
        clickTimestamp: req.body.clickTimestamp,
        formViewTimestamp: req.body.formViewTimestamp,
        submissionTimestamp: new Date()
      }
    });

    await lead.save({ session });

    // Update influencer stats 📈
    const influencerIndex = campaign.influencers.findIndex(inf => inf.referralCode === referralCode);
    campaign.influencers[influencerIndex].stats = {
      clicks: campaign.influencers[influencerIndex].stats?.clicks || 0,
      conversions: (campaign.influencers[influencerIndex].stats?.conversions || 0) + 1,
      revenue: campaign.influencers[influencerIndex].stats?.revenue || 0
    };
    
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
        browserStats: {
          chrome: 0,
          firefox: 0,
          safari: 0,
          edge: 0,
          opera: 0,
          other: 0
        },
        locationStats: {},
        timeStats: {
          hourly: Array(24).fill(0),
          daily: Array(7).fill(0),
          monthly: Array(12).fill(0)
        }
      };
    }

    // Initialize deviceStats if not exists
    if (!campaign.analytics.deviceStats) {
      campaign.analytics.deviceStats = {
        desktop: 0,
        mobile: 0,
        tablet: 0
      };
    }
    
    // Update campaign analytics 📊
    campaign.analytics.formSubmissions++;
    campaign.analytics.conversions++;
    
    // Calculate conversion rate
    if (campaign.analytics.totalClicks > 0) {
    campaign.analytics.conversionRate = 
        (campaign.analytics.conversions / campaign.analytics.totalClicks) * 100;
    }

    // Update device stats with safe increment
    campaign.analytics.deviceStats[deviceInfo.type] = 
      (campaign.analytics.deviceStats[deviceInfo.type] || 0) + 1;

    // Update browser stats safely
    try {
      // Get browser info with fallback
      const browserName = (browserInfo?.browser || 'other').toLowerCase();
      const supportedBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera'];
      
      // Ensure browserStats exists
      if (typeof campaign.analytics.browserStats !== 'object') {
        campaign.analytics.browserStats = {
          chrome: 0,
          firefox: 0,
          safari: 0,
          edge: 0,
          opera: 0,
          other: 0
        };
      }
      
      // Use 'other' if browser is not in supported list
      const browserKey = supportedBrowsers.includes(browserName) ? browserName : 'other';
      
      // Safe increment with fallback
      campaign.analytics.browserStats[browserKey] = 
        (campaign.analytics.browserStats[browserKey] || 0) + 1;
    } catch (err) {
      console.error('Error updating browser stats:', err);
      // If any error occurs, increment 'other'
      campaign.analytics.browserStats.other = 
        (campaign.analytics.browserStats.other || 0) + 1;
    }

    // Update location stats safely
    try {
      // Initialize locationStats if not exists
      if (!campaign.analytics.locationStats) {
        campaign.analytics.locationStats = {};
      }

      // Only update if location data exists and has country info
      if (location && typeof location === 'object' && location.country) {
        const locationKey = location.country.toLowerCase();
        campaign.analytics.locationStats[locationKey] = 
          (campaign.analytics.locationStats[locationKey] || 0) + 1;
      } else {
        // Track unknown location
        campaign.analytics.locationStats['unknown'] = 
          (campaign.analytics.locationStats['unknown'] || 0) + 1;
      }
    } catch (err) {
      console.error('Error updating location stats:', err);
      // If any error occurs, increment unknown
      if (!campaign.analytics.locationStats) {
        campaign.analytics.locationStats = {};
      }
      campaign.analytics.locationStats['unknown'] = 
        (campaign.analytics.locationStats['unknown'] || 0) + 1;
    }

    // Update time stats safely
    try {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      const month = now.getMonth();

      // Initialize timeStats if not exists
      if (!campaign.analytics.timeStats) {
        campaign.analytics.timeStats = {
          hourly: Array(24).fill(0),
          daily: Array(7).fill(0),
          monthly: Array(12).fill(0)
        };
      }

      // Ensure each array exists and has correct length
      if (!Array.isArray(campaign.analytics.timeStats.hourly) || 
          campaign.analytics.timeStats.hourly.length !== 24) {
        campaign.analytics.timeStats.hourly = Array(24).fill(0);
      }
      if (!Array.isArray(campaign.analytics.timeStats.daily) || 
          campaign.analytics.timeStats.daily.length !== 7) {
        campaign.analytics.timeStats.daily = Array(7).fill(0);
      }
      if (!Array.isArray(campaign.analytics.timeStats.monthly) || 
          campaign.analytics.timeStats.monthly.length !== 12) {
        campaign.analytics.timeStats.monthly = Array(12).fill(0);
      }

      // Safe increment of time stats
      campaign.analytics.timeStats.hourly[hour] = 
        (campaign.analytics.timeStats.hourly[hour] || 0) + 1;
      campaign.analytics.timeStats.daily[day] = 
        (campaign.analytics.timeStats.daily[day] || 0) + 1;
      campaign.analytics.timeStats.monthly[month] = 
        (campaign.analytics.timeStats.monthly[month] || 0) + 1;

    } catch (err) {
      console.error('Error updating time stats:', err);
      // Initialize with default values if error occurs
      campaign.analytics.timeStats = {
        hourly: Array(24).fill(0),
        daily: Array(7).fill(0),
        monthly: Array(12).fill(0)
      };
    }

    // Save all updates with session
    await campaign.save({ session });

    // Update business analytics 📈
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId: campaign.businessId });
    
    // Create analytics record if it doesn't exist
    if (!businessAnalytics) {
      businessAnalytics = new BusinessAnalytics({ businessId: campaign.businessId });
    }

    // Track new customer and analytics
    if (isNewUser) {
      await businessAnalytics.trackNewCustomer(true);
    }
    await businessAnalytics.trackSource('campaign');
    await businessAnalytics.trackDevice(deviceInfo.type);
    await businessAnalytics.trackBrowser(browserInfo.browser);

    // Save analytics
    await businessAnalytics.save({ session });

    // Generate claim ID 🎫
    const claimId = crypto.randomBytes(16).toString('hex');

    // Create rich QR data object 🔐
    const qrData = {
      claimId,
      voucherId: campaign.voucherId._id,
      code: campaign.voucherId.code,
      businessId: campaign.businessId,
      userId: user._id,
      type: 'claimed_voucher',
      timestamp: new Date(),
      expiryDate: campaign.voucherId.endDate
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
      { _id: campaign.voucherId._id },
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
      },
      { session }
    );

    // Track QR code generation in business analytics
    await businessAnalytics.trackQRScan();
    await businessAnalytics.save({ session });

    // Update user's voucher claim status
    await User.updateOne(
      { 
        _id: user._id,
        'voucherClaims.voucherId': campaign.voucherId._id 
      },
      {
        $set: {
          'voucherClaims.$.qrGenerated': true,
          'voucherClaims.$.qrGeneratedAt': new Date(),
          'voucherClaims.$.hash': hash
        }
      },
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully! 🎉',
      data: {
        leadId: lead._id,
        userId: user._id,
        campaign: {
          id: campaign._id,
          name: campaign.name,
          influencer: {
            name: influencer.name,
            platform: influencer.platform
          }
        },
        voucher: {
          id: campaign.voucherId._id,
          title: campaign.voucherId.title,
          description: campaign.voucherId.description,
          code: campaign.voucherId.code,
          discountType: campaign.voucherId.discountType,
          discountValue: campaign.voucherId.discountValue,
          minimumPurchase: campaign.voucherId.minimumPurchase,
          maximumDiscount: campaign.voucherId.maximumDiscount,
          expiryDate: campaign.voucherId.endDate,
          usageLimit: campaign.voucherId.usageLimit,
          currentUsage: campaign.voucherId.currentUsage,
          qrCode,
          hash
        },
        claim: {
          id: claimId,
          generatedAt: new Date(),
          status: 'active'
        }
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Submit campaign form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit form! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// Get campaign analytics 📊
const getCampaignAnalytics = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const businessId = req.user.userId;

    // Get campaign with populated data
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

    // Calculate overview metrics
    const overview = {
        totalClicks: campaign.analytics?.totalClicks || 0,
        uniqueClicks: campaign.analytics?.uniqueClicks || 0,
        formViews: campaign.analytics?.formViews || 0,
      formSubmissions: leads.length || 0,
        conversionRate: campaign.analytics?.totalClicks ? 
        ((leads.length / campaign.analytics.totalClicks) * 100).toFixed(2) : "0.00",
      averageFormFillTime: leads.reduce((acc, lead) => {
        const fillTime = lead.analytics?.formFillTime || 0;
        return acc + fillTime;
      }, 0) / (leads.length || 1)
    };

    // Process referral links with proper stats
    const referralLinks = campaign.influencers.map(link => {
      const linkLeads = leads.filter(lead => lead.referralCode === link.referralCode);
      return {
        code: link.referralCode,
        influencerName: link.name,
        platform: link.platform,
        analytics: {
          totalClicks: link.stats?.clicks || 0,
          uniqueClicks: link.stats?.uniqueClicks || 0,
          formViews: link.stats?.formViews || 0,
          formSubmissions: linkLeads.length,
          conversionRate: link.stats?.clicks ? 
            ((linkLeads.length / link.stats.clicks) * 100).toFixed(2) : "0.00"
        }
      };
    });

    // Calculate device breakdown from leads
    const deviceBreakdown = leads.reduce((acc, lead) => {
      const device = lead.analytics?.deviceType?.toLowerCase() || 'unknown';
      acc[device] = (acc[device] || 0) + 1;
      return acc;
    }, {
        desktop: 0,
        mobile: 0,
        tablet: 0
    });

    // Calculate browser stats from leads
    const browserStats = leads.reduce((acc, lead) => {
      const browser = lead.analytics?.browser?.toLowerCase() || 'other';
      acc[browser] = (acc[browser] || 0) + 1;
      return acc;
    }, {});

    // Calculate location stats from leads
    const locationStats = leads.reduce((acc, lead) => {
      const location = lead.analytics?.location?.country?.toLowerCase() || 'unknown';
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {});

    // Ensure timeStats has proper structure
    const timeStats = {
      hourly: campaign.analytics?.timeStats?.hourly || Array(24).fill(0),
      daily: campaign.analytics?.timeStats?.daily || Array(7).fill(0),
      monthly: campaign.analytics?.timeStats?.monthly || Array(12).fill(0)
    };

    // Format recent leads
    const recentLeads = leads.slice(0, 5).map(lead => ({
        id: lead._id,
        email: lead.formData?.email || '',
        name: `${lead.formData?.firstName || ''} ${lead.formData?.lastName || ''}`.trim(),
        submittedAt: lead.analytics?.submissionTimestamp || lead.createdAt,
      referralCode: lead.referralCode,
        device: lead.analytics?.deviceType || 'unknown'
    }));

    // Calculate summary stats
    const summary = {
      totalLeads: leads.length,
      conversionRate: overview.conversionRate,
      topPlatforms: referralLinks.reduce((acc, link) => {
        if (link.platform) {
          acc[link.platform] = (acc[link.platform] || 0) + link.analytics.formSubmissions;
        }
        return acc;
      }, {}),
      deviceDistribution: deviceBreakdown
    };

    res.json({
      success: true,
      data: {
        overview,
        referralLinks,
        deviceBreakdown,
        browserStats,
        locationStats,
        timeStats,
        recentLeads,
        summary
      }
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
        select: 'code title description discountType discountValue startDate endDate isActive question answers',
      })
      .populate('answers.userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Campaign.countDocuments(query);

    // Get API URL from env 🌐
    const apiUrl = process.env.BASE_URL;

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
        // Format link as API endpoint using env URL
        referralLink: `${apiUrl}/api/campaigns/click/${inf.referralCode}`,
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

      // Add question and answers data
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
        updatedAt: campaign.updatedAt,
        question: campaign.question,
        answers: campaign.answers.map(answer => ({
          id: answer._id,
          answer: answer.answer,
          submittedAt: answer.submittedAt,
          user: answer.userId ? {
            id: answer.userId._id,
            name: `${answer.userId.firstName} ${answer.userId.lastName}`,
            email: answer.userId.email
          } : null
        })),
        answerStats: {
          totalAnswers: campaign.answers.length,
          uniqueUsers: new Set(campaign.answers.map(a => a.userId?.toString())).size
        }
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

// Submit answer for campaign question 📝
const submitCampaignAnswer = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { answer, email } = req.body;  // Get email from request body

    // Validate campaignId format
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID format! 🚫'
      });
    }

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required! 📧'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email! 👤'
      });
    }

    // Find campaign
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found! 🔍'
      });
    }

    // Check if question exists and is required
    if (!campaign.question || !campaign.question.text) {
      return res.status(400).json({
        success: false,
        message: 'No question available for this campaign! ❌'
      });
    }

    // Check if answer is provided when required
    if (campaign.question.isRequired && !answer) {
      return res.status(400).json({
        success: false,
        message: 'Answer is required for this question! ❗'
      });
    }

    // Check if user already answered
    const existingAnswer = campaign.answers.find(a => a.userId.toString() === user._id.toString());
    if (existingAnswer) {
      return res.status(400).json({
        success: false,
        message: 'You have already answered this question! ✋'
      });
    }

    // Add answer
    campaign.answers.push({
      userId: user._id,  // Use found user's ID
      answer,
      submittedAt: new Date()
    });

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Answer submitted successfully! 🎉',
      data: {
        answer: campaign.answers[campaign.answers.length - 1],
        user: {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        }
      }
    });
  } catch (error) {
    console.error('Submit campaign answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit answer! 😢'
    });
  }
};

// Update campaign question ❓
const updateCampaignQuestion = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { text, isRequired = false } = req.body;
    const businessId = req.user.userId;

    // Validate campaignId format
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID format! 🚫'
      });
    }

    // Find and update campaign
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

    // Update question
    campaign.question = {
      text: text,
      isRequired
    };

    await campaign.save();

    res.json({
      success: true,
      message: 'Campaign question updated successfully! 🎉',
      data: {
        question: campaign.question
      }
    });
  } catch (error) {
    console.error('Update campaign question error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign question! 😢'
    });
  }
};

// Get campaign answers 📊
const getCampaignAnswers = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const businessId = req.user.userId;

    // Validate campaignId format
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID format! 🚫'
      });
    }

    // Find campaign with populated answers
    const campaign = await Campaign.findOne({ 
      _id: campaignId, 
      businessId 
    }).populate('answers.userId', 'firstName lastName email');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found! 🔍'
      });
    }

    // Format answers
    const answers = campaign.answers.map(answer => ({
      id: answer._id,
      answer: answer.answer,
      submittedAt: answer.submittedAt,
      user: {
        id: answer.userId._id,
        name: `${answer.userId.firstName} ${answer.userId.lastName}`,
        email: answer.userId.email
      }
    }));

    res.json({
      success: true,
      data: {
        question: campaign.question,
        answers,
        stats: {
          totalAnswers: answers.length,
          uniqueUsers: new Set(answers.map(a => a.user.id)).size
        }
      }
    });
  } catch (error) {
    console.error('Get campaign answers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign answers! 😢'
    });
  }
};

// Update campaign details 🔄
const updateCampaign = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { campaignId } = req.params;
    const businessId = req.user.userId;
    const updateData = req.body;

    // find campaign and check ownership
    const campaign = await Campaign.findOne({ 
      _id: campaignId,
      businessId 
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or unauthorized! 🚫'
      });
    }

    // validate dates if updating
    if (updateData.startDate || updateData.endDate) {
      const startDate = new Date(updateData.startDate || campaign.startDate);
      const endDate = new Date(updateData.endDate || campaign.endDate);
      
      // if (startDate >= endDate) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'End date must be after start date! ⚠️'
      //   });
      // }
    }

    // validate voucher if updating
    if (updateData.voucherId) {
      if (!mongoose.Types.ObjectId.isValid(updateData.voucherId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid voucher ID format! 🚫'
        });
      }

      const voucher = await Coupon.findOne({
        _id: updateData.voucherId,
        businessId
      });

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Voucher not found or unauthorized! 🎫'
        });
      }
    }

    // handle influencer updates
    if (updateData.influencers) {
      // keep existing stats for existing influencers
      const updatedInfluencers = updateData.influencers.map(newInf => {
        const existingInf = campaign.influencers.find(
          inf => inf.name === newInf.name && inf.platform === newInf.platform
        );

        if (existingInf) {
          return {
            ...newInf,
            referralCode: existingInf.referralCode,
            stats: existingInf.stats
          };
        }

        // generate new code for new influencers
        return {
          ...newInf,
          referralCode: generateReferralCode(campaignId, newInf.name),
          stats: {
            clicks: 0,
            conversions: 0,
            revenue: 0
          }
        };
      });

      updateData.influencers = updatedInfluencers;
    }

    // handle form config updates
    if (updateData.formConfig) {
      updateData.formConfig.fields = updateData.formConfig.fields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.isRequired || false,
        options: field.options || []
      }));
    }

    // handle budget updates
    if (updateData.budget) {
      updateData.budget = {
        ...campaign.budget,
        ...updateData.budget,
        remaining: updateData.budget.total - (campaign.budget?.spent || 0)
      };
    }

    // update campaign status based on dates
    const now = new Date();
    if (updateData.startDate || updateData.endDate) {
      const startDate = new Date(updateData.startDate || campaign.startDate);
      const endDate = new Date(updateData.endDate || campaign.endDate);

      if (now < startDate) {
        updateData.status = 'scheduled';
      } else if (now > endDate) {
        updateData.status = 'completed';
      } else if (campaign.status !== 'paused' && campaign.status !== 'cancelled') {
        updateData.status = 'active';
      }
    }

    // update campaign
    const updatedCampaign = await Campaign.findOneAndUpdate(
      { _id: campaignId, businessId },
      { 
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      },
      { 
        new: true,
        session,
        runValidators: true
      }
    ).populate([
      {
        path: 'voucherId',
        select: 'code title description discountType discountValue startDate endDate'
      }
    ]);

    await session.commitTransaction();

    // prepare share URLs for response
    const shareUrls = updatedCampaign.influencers.map(inf => ({
      name: inf.name,
      platform: inf.platform,
      referralCode: inf.referralCode,
      shareUrl: `${process.env.BASE_URL}/ref/${inf.referralCode}`
    }));

    res.json({
      success: true,
      message: 'Campaign updated successfully! 🎉',
      data: {
        campaign: updatedCampaign,
        shareUrls,
        changes: {
          datesUpdated: !!(updateData.startDate || updateData.endDate),
          voucherUpdated: !!updateData.voucherId,
          influencersUpdated: !!updateData.influencers,
          formUpdated: !!updateData.formConfig,
          budgetUpdated: !!updateData.budget,
          statusUpdated: !!updateData.status
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Update campaign error:', error);

    // handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update campaign! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  createCampaign,
  trackCampaignClick,
  submitCampaignForm,
  getCampaignAnalytics,
  getAllCampaigns,
  listCampaigns,
  submitCampaignAnswer,
  updateCampaignQuestion,
  getCampaignAnswers,
  updateCampaign
}; 