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
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found or inactive! 🚫'
      });
    }

    // Process campaign type specific data
    switch (campaignData.type) {
      case 'google_ads':
        // Validate Google Ads details
        if (!campaignData.googleAdsDetails || !campaignData.googleAdsDetails.adsId) {
          return res.status(400).json({
            success: false,
            message: 'Google Ads ID is required! 🚫'
          });
        }
        // Generate referral code for Google Ads
        campaignData.googleAdsDetails.referralCode = generateReferralCode(campaignData._id, `GA-${campaignData.googleAdsDetails.adsId}`);
        break;

      case 'agency':
        // Validate Agency details
        if (!campaignData.agencyDetails || !campaignData.agencyDetails.name || !campaignData.agencyDetails.contactPerson) {
          return res.status(400).json({
            success: false,
            message: 'Agency name and contact details are required! 🚫'
          });
        }
        // Generate referral code for Agency
        campaignData.agencyDetails.referralCode = generateReferralCode(campaignData._id, `AG-${campaignData.agencyDetails.name}`);
        break;

      case 'business':
        // Validate Business details
        if (!campaignData.businessDetails || !campaignData.businessDetails.name || !campaignData.businessDetails.contactPerson) {
          return res.status(400).json({
            success: false,
            message: 'Business name and contact details are required! 🚫'
          });
        }
        // Generate referral code for Business
        campaignData.businessDetails.referralCode = generateReferralCode(campaignData._id, `BZ-${campaignData.businessDetails.name}`);
        break;

      case 'influencer':
        // Process form config for influencer campaigns
        if (campaignData.formConfig) {
          campaignData.formConfig.fields = campaignData.formConfig.fields.map(field => ({
            name: field.name,
            type: field.type,
            required: field.isRequired || false,
            options: field.options || []
          }));
        }

        // Generate referral codes for influencers
        if (campaignData.influencers) {
          campaignData.influencers = campaignData.influencers.map(inf => ({
            ...inf,
            referralCode: generateReferralCode(campaignData._id, inf.name),
            stats: { clicks: 0, conversions: 0, revenue: 0 }
          }));
        }
        break;
    }

    // Create campaign with type-specific details 🎯
    const campaign = new Campaign({
      ...campaignData,
      businessId,
      status: 'draft'
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

    // Prepare response based on campaign type
    let responseData = {
      campaign,
      message: 'Campaign created successfully! 🎉'
    };

    // Add type-specific data to response
    switch (campaign.type) {
      case 'influencer':
        responseData.shareUrls = campaign.influencers.map(inf => ({
          name: inf.name,
          platform: inf.platform,
          referralCode: inf.referralCode,
          shareUrl: `${process.env.BASE_URL}/ref/${inf.referralCode}`
        }));
        break;

      case 'google_ads':
        responseData.shareUrl = `${process.env.BASE_URL}/ref/${campaign.googleAdsDetails.referralCode}`;
        responseData.googleAdsLink = `https://ads.google.com/aw/campaigns/${campaign.googleAdsDetails.adsId}`;
        break;

      case 'agency':
        responseData.shareUrl = `${process.env.BASE_URL}/ref/${campaign.agencyDetails.referralCode}`;
        responseData.agencyPortalLink = `${process.env.BASE_URL}/agency/campaigns/${campaign._id}`;
        break;

      case 'business':
        responseData.shareUrl = `${process.env.BASE_URL}/ref/${campaign.businessDetails.referralCode}`;
        responseData.businessDashboardLink = `${process.env.BASE_URL}/business/campaigns/${campaign._id}`;
        break;
    }

    res.status(201).json({
      success: true,
      message: responseData.message,
      data: responseData
    });

  } catch (error) {
    console.error('Create campaign error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

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

    // Find campaign by referral code for any type 🔍
    const campaign = await Campaign.findOne({
      $or: [
        { 'influencers.referralCode': referralCode },
        { 'googleAdsDetails.referralCode': referralCode },
        { 'agencyDetails.referralCode': referralCode },
        { 'businessDetails.referralCode': referralCode }
      ]
    }).populate('businessId', 'businessProfile email');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Get voucher details and update its analytics 🎫
    const voucher = await Coupon.findById(campaign.voucherId);
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found! 🚫'
      });
    }

    // Get source details based on campaign type
    let sourceDetails = null;
    let sourceType = campaign.type;

    switch (campaign.type) {
      case 'influencer':
        const influencer = campaign.influencers.find(inf => inf.referralCode === referralCode);
        if (!influencer) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'influencer',
          name: influencer.name,
          platform: influencer.platform,
          stats: influencer.stats
        };
        // Update influencer stats
        const influencerIndex = campaign.influencers.findIndex(inf => inf.referralCode === referralCode);
        campaign.influencers[influencerIndex].stats.clicks++;
        break;

      case 'google_ads':
        if (campaign.googleAdsDetails.referralCode !== referralCode) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'google_ads',
          adsId: campaign.googleAdsDetails.adsId,
          stats: campaign.googleAdsDetails.stats
        };
        // Update Google Ads stats
        campaign.googleAdsDetails.stats.clicks++;
        break;

      case 'agency':
        if (campaign.agencyDetails.referralCode !== referralCode) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'agency',
          name: campaign.agencyDetails.name,
          stats: campaign.agencyDetails.stats
        };
        // Update Agency stats
        campaign.agencyDetails.stats.clicks++;
        break;

      case 'business':
        if (campaign.businessDetails.referralCode !== referralCode) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'business',
          name: campaign.businessDetails.name,
          stats: campaign.businessDetails.stats
        };
        // Update Business stats
        campaign.businessDetails.stats.clicks++;
        break;
    }

    // Track device and location info 📱
    const deviceInfo = detectDevice(userAgent);
    const browserInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(ipAddress);

    // ============ Update Campaign Analytics ============
    // Track click analytics using campaign model method
    campaign.trackClick(deviceInfo, browserInfo, location);

    // ============ Update Voucher Analytics ============
    // Initialize analytics if not exists
    if (!voucher.analytics) {
      voucher.analytics = {
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
      };
    }

    // Update voucher analytics
    voucher.analytics.clicks++;
    
    // Update marketplace analytics if voucher is in marketplace
    if (voucher.marketplace) {
      voucher.analytics.marketplace.clicks++;
    }

    // Save all updates with session
    await Promise.all([
      campaign.save({ session }),
      voucher.save({ session })
    ]);

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
        voucher: {
          code: voucher.code,
          title: voucher.title,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumPurchase: voucher.minimumPurchase,
          question: voucher.question || null
        },
        source: sourceDetails
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

    // Find campaign based on campaign type and referral code 🎯
    const campaign = await Campaign.findOne({
      _id: campaignId,
      $or: [
        { 'influencers.referralCode': referralCode },
        { 'googleAdsDetails.referralCode': referralCode },
        { 'agencyDetails.referralCode': referralCode },
        { 'businessDetails.referralCode': referralCode }
      ]
    }).populate('voucherId');

    if (!campaign) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or inactive! 🚫'
      });
    }

    // Get source details based on campaign type 🔍
    let sourceDetails = null;
    let sourceType = campaign.type;
     // Track device and location info 📱
     const deviceInfo = detectDevice(userAgent);
     const browserInfo = parseUserAgent(userAgent);
     const location = await getLocationFromIP(ipAddress);
 
     // Track click analytics using model method
     campaign.trackClick(deviceInfo, browserInfo, location);

    switch (campaign.type) {
      case 'influencer':
        const influencer = campaign.influencers.find(inf => inf.referralCode === referralCode);
        if (!influencer) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'influencer',
          id: influencer._id,
          name: influencer.name,
          platform: influencer.platform
        };
        // Update influencer stats
        const influencerIndex = campaign.influencers.findIndex(inf => inf.referralCode === referralCode);
        campaign.influencers[influencerIndex].stats.conversions++;
        break;

      case 'google_ads':
        if (campaign.googleAdsDetails.referralCode !== referralCode) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'google_ads',
          adsId: campaign.googleAdsDetails.adsId
        };
        // Update Google Ads stats
        campaign.googleAdsDetails.stats.conversions++;
        break;

      case 'agency':
        if (campaign.agencyDetails.referralCode !== referralCode) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'agency',
          name: campaign.agencyDetails.name,
          contactPerson: campaign.agencyDetails.contactPerson
        };
        // Update Agency stats
        campaign.agencyDetails.stats.conversions++;
        break;

      case 'business':
        if (campaign.businessDetails.referralCode !== referralCode) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code! 🚫'
          });
        }
        sourceDetails = {
          type: 'business',
          name: campaign.businessDetails.name,
          contactPerson: campaign.businessDetails.contactPerson
        };
        // Update Business stats
        campaign.businessDetails.stats.conversions++;
        break;
    }

    // Check for existing user across all businesses 🌐
    let user = await User.findOne({ 
      $or: [
        { email: formData.email },
        { phoneNumber: formData.phoneNumber }
      ]
    }).session(session);

    const isNewUser = !user;

    // User exists handling
    if (user) {
      // Check for existing claim for THIS voucher + THIS business
      const existingClaim = user.voucherClaims?.some(claim => 
        claim.voucherId.equals(campaign.voucherId._id) && 
        claim.businessId.equals(campaign.businessId)
      );

      if (existingClaim) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'You already claimed this voucher! ❌'
        });
      }
      
      // Add claim if not exists (different business/voucher is allowed)
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
                  type: campaign.type,
                  campaignId: campaign._id,
                  ...sourceDetails,
                  referralCode: referralCode
                }
              }
            }
          }
        },
        { session }
      );
    } else {
      // Create new user only if completely new to system 🆕
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
            type: campaign.type,
            campaignId: campaign._id,
            campaignName: campaign.name,
            ...sourceDetails,
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
              type: campaign.type,
              campaignId: campaign._id,
              ...sourceDetails,
              referralCode: referralCode
            }
          }
        }]
      });
      await user.save({ session });
    }

    // Always create new campaign lead 📝
    const lead = new CampaignLead({
      campaignId,
      referralCode,
      businessId: campaign.businessId,
      userId: user._id,
      formData,
      sourceDetails: {
        type: campaign.type,
        ...sourceDetails
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

    // Update campaign stats based on type 📈
    switch (campaign.type) {
      case 'google_ads':
        campaign.googleAdsDetails.stats.revenue = 
          (campaign.googleAdsDetails.stats.revenue || 0) + (campaign.voucherId.discountValue || 0);
        break;
      case 'agency':
        campaign.agencyDetails.stats.revenue = 
          (campaign.agencyDetails.stats.revenue || 0) + (campaign.voucherId.discountValue || 0);
        break;
      case 'business':
        campaign.businessDetails.stats.revenue = 
          (campaign.businessDetails.stats.revenue || 0) + (campaign.voucherId.discountValue || 0);
        break;
      case 'influencer':
        const influencerIndex = campaign.influencers.findIndex(inf => inf.referralCode === referralCode);
        if (influencerIndex !== -1) {
          campaign.influencers[influencerIndex].stats.revenue = 
            (campaign.influencers[influencerIndex].stats.revenue || 0) + (campaign.voucherId.discountValue || 0);
        }
        break;
    }

    // Save all updates with session
    await campaign.save({ session });

    // Update business analytics 📈
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId: campaign.businessId });
    
    if (!businessAnalytics) {
      businessAnalytics = new BusinessAnalytics({ businessId: campaign.businessId });
    }

    // Track new customer and analytics
    if (isNewUser) {
      await businessAnalytics.trackNewCustomer(true);
    }
    await businessAnalytics.trackSource(campaign.type);
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
    session.endSession();

    res.status(201).json({
      success: true,
      message: isNewUser ? 'Form submitted successfully! 🎉' : 'Voucher claim added! ✅',
      data: {
        leadId: lead._id,
        userId: user._id,
        campaign: {
          id: campaign._id,
          name: campaign.name
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
        },
        userStatus: isNewUser ? 'new_user' : 'existing_user'
      }
    });
  } catch (error) {
    console.error('Submit campaign form error:', error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
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
    const { status, type, page = 1, limit = 10, search } = req.query;

    // Build query 🔍
    const query = { businessId };
    if (status) query.status = status;
    if (type) query.type = type;
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
      const influencerLinks = campaign.influencers?.map(inf => ({
        id: inf._id,
        name: inf.name,
        type: inf.type,
        platform: inf.platform,
        referralCode: inf.referralCode,
        referralLink: `${apiUrl}/api/campaigns/ref/${inf.referralCode}`,
        stats: {
          clicks: inf.stats?.clicks || 0,
          conversions: inf.stats?.conversions || 0,
          revenue: inf.stats?.revenue || 0,
          conversionRate: inf.stats?.clicks ? 
            ((inf.stats.conversions / inf.stats.clicks) * 100).toFixed(2) : 
            "0.00"
        }
      })) || [];

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

      // Base campaign data with original structure
      const campaignData = {
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

      // Add type-specific data without modifying original structure
      if (campaign.type === 'google_ads' && campaign.googleAdsDetails) {
        campaignData.googleAdsDetails = {
          adsId: campaign.googleAdsDetails.adsId,
          stats: campaign.googleAdsDetails.stats || {
            clicks: 0,
            conversions: 0,
            revenue: 0
          },
          referralLink: `${apiUrl}/api/campaigns/ref/${campaign.googleAdsDetails.referralCode}`,
        };
      }

      if (campaign.type === 'agency' && campaign.agencyDetails) {
        campaignData.agencyDetails = {
          name: campaign.agencyDetails.name,
          contactPerson: campaign.agencyDetails.contactPerson,
          stats: campaign.agencyDetails.stats || {
            clicks: 0,
            conversions: 0,
            revenue: 0
          },
          referralLink: `${apiUrl}/api/campaigns/ref/${campaign.agencyDetails.referralCode}`,
        };
      }

      if (campaign.type === 'business' && campaign.businessDetails) {
        campaignData.businessDetails = {
          name: campaign.businessDetails.name,
          contactPerson: campaign.businessDetails.contactPerson,
          stats: campaign.businessDetails.stats || {
            clicks: 0,
            conversions: 0,
            revenue: 0
          },
          referralLink: `${apiUrl}/api/campaigns/ref/${campaign.businessDetails.referralCode}`,
        };
      }

      return campaignData;
    });

    // Return formatted response with original structure 📬
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
          paused: processedCampaigns.filter(c => c.status === 'paused').length,
          // Add type summary without modifying original structure
          byType: {
            influencer: processedCampaigns.filter(c => c.type === 'influencer').length,
            google_ads: processedCampaigns.filter(c => c.type === 'google_ads').length,
            agency: processedCampaigns.filter(c => c.type === 'agency').length,
            business: processedCampaigns.filter(c => c.type === 'business').length
          }
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
    const { question } = req.body;
    const businessId = req.user.userId;

    // Validate payload
    if (!question || !question.text) {
      return res.status(400).json({
        success: false,
        message: 'Question text is required! 📝'
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
      text: question.text,
      isRequired: question.isRequired || false
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