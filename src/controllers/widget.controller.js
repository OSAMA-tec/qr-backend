// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const { uploadToFirebase } = require('../utils/upload.utils');
const WidgetTemplate = require('../models/widgetTemplate.model');
const { uploadTemplateThumbnail } = require('../utils/upload.utils');

// Get widget configuration 🔧
const getWidgetConfig = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Find business and their active configuration
    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business',
      isVerified: true 
    }).select('businessProfile businessName picUrl');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or not verified! 🏢'
      });
    }

    // Get linked vouchers first
    const linkedVoucherIds = business.businessProfile?.widgetSettings?.linkedVouchers || [];
    
    // Get active coupons that are linked to the widget
    const activeCoupons = await Coupon.find({
      _id: { $in: linkedVoucherIds },
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).select('title description discountType discountValue maxRedemptions currentRedemptions');

    // Filter out fully redeemed coupons
    const availableCoupons = activeCoupons.filter(coupon => 
      !coupon.maxRedemptions || coupon.currentRedemptions < coupon.maxRedemptions
    );

    res.json({
      success: true,
      data: {
        business: {
          id: business._id,
          name: business.businessName || business.businessProfile?.businessName,
          logo: business.picUrl || business.businessProfile?.logo,
          theme: business.businessProfile?.widgetTheme || 'light'
        },
        widget: {
          position: business.businessProfile?.widgetSettings?.position || 'bottom-right',
          timing: business.businessProfile?.widgetSettings?.timing || 'immediate',
          animation: business.businessProfile?.widgetSettings?.animation || 'slide',
          colors: business.businessProfile?.widgetSettings?.colors || {
            primary: '#4CAF50',
            secondary: '#2196F3',
            text: '#000000'
          }
        },
        coupons: availableCoupons.map(coupon => ({
          id: coupon._id,
          title: coupon.title,
          description: coupon.description,
          discount: {
            type: coupon.discountType,
            value: coupon.discountValue
          },
          remaining: coupon.maxRedemptions ? 
            coupon.maxRedemptions - coupon.currentRedemptions : 
            'unlimited'
        }))
      }
    });
  } catch (error) {
    console.error('Get widget config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget configuration! 😢'
    });
  }
};

// Process voucher claim for guest user 🎟️
const claimVoucher = async (req, res) => {
  try {
    const { 
      businessId, 
      couponId, 
      customerEmail, 
      customerName, 
      phoneNumber,
      description = ''
    } = req.body;

    // Validate business
    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business',
      isVerified: true 
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or not verified! 🏢'
      });
    }

    // Find and validate coupon
    const coupon = await Coupon.findOne({
      _id: couponId,
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found or expired! 🎫'
      });
    }

    // Check redemption limit
    if (coupon.maxRedemptions && coupon.currentRedemptions >= coupon.maxRedemptions) {
      return res.status(400).json({
        success: false,
        message: 'Coupon redemption limit reached! 🚫'
      });
    }

    // Find or create customer (as guest)
    let customer = await User.findOne({ email: customerEmail });
    if (!customer) {
      customer = new User({
        email: customerEmail,
        firstName: customerName.split(' ')[0],
        lastName: customerName.split(' ')[1] || '',
        phoneNumber,
        role: 'customer',
        isVerified: false,
        isGuest: true,
        guestDetails: {
          description,
          claimedFrom: 'widget',
          businessId
        }
      });
      await customer.save();
    }

    // Generate unique code
    const claimCode = generateClaimCode(businessId, couponId, customer._id);

    // Increment redemption count
    coupon.currentRedemptions += 1;
    await coupon.save();

    // 🎟️ Generate temporary QR code and wallet URLs (to be implemented later)
    const qrCodeData = `https://example.com/qr/${claimCode}`; // 🔲 Temporary QR code URL
    const walletUrls = {
      apple: `https://example.com/wallet/apple/${claimCode}`, // 🍎 Temporary Apple Wallet URL
      google: `https://example.com/wallet/google/${claimCode}` // 🤖 Temporary Google Wallet URL
    };

    return res.status(201).json({
      success: true,
      message: 'Voucher claimed successfully! 🎉',
      data: {
        claimCode,
        couponDetails: {
          title: coupon.title,
          description: coupon.description,
          discount: {
            type: coupon.discountType,
            value: coupon.discountValue
          },
          validUntil: coupon.endDate
        },
        qrCode: qrCodeData,
        wallet: walletUrls // 💳 Temporary wallet URLs
      }
    });
  } catch (error) {
    console.error('Claim voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim voucher! Please try again later 😢'
    });
  }
};

// Get customization options 🎨
const getCustomizationOptions = async (req, res) => {
  try {
    const businessId = req.user.userId;

    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business' 
    }).select('businessProfile.widgetSettings businessName picUrl');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    res.json({
      success: true,
      data: {
        currentSettings: {
          logo: business.picUrl || business.businessProfile?.logo,
          theme: business.businessProfile?.widgetTheme || 'light',
          ...business.businessProfile?.widgetSettings
        },
        availableOptions: {
          themes: ['light', 'dark', 'custom'],
          positions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
          timings: ['immediate', 'delay', 'scroll', 'exit-intent'],
          animations: ['fade', 'slide', 'bounce']
        }
      }
    });
  } catch (error) {
    console.error('Get customization options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customization options! 😢'
    });
  }
};

// Update widget appearance 🎨
const updateWidgetAppearance = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const {
      logo,
      theme,
      position,
      timing,
      animation,
      colors,
      displayRules
    } = req.body;

    const business = await User.findOneAndUpdate(
      { _id: businessId, role: 'business' },
      {
        $set: {
          ...(logo && { 'businessProfile.logo': logo }),
          'businessProfile.widgetTheme': theme,
          'businessProfile.widgetSettings': {
            position,
            timing,
            animation,
            colors,
            displayRules,
            updatedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    res.json({
      success: true,
      message: 'Widget appearance updated successfully! 🎨',
      data: {
        logo: business.businessProfile?.logo,
        theme: business.businessProfile?.widgetTheme,
        settings: business.businessProfile?.widgetSettings
      }
    });
  } catch (error) {
    console.error('Update widget appearance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update widget appearance! 😢'
    });
  }
};

// Get embed code 📝
const getEmbedCode = async (req, res) => {
  try {
    const businessId = req.user.userId;

    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business' 
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    // Generate embed code with latest widget version
    const embedCode = `
<!-- MrIntroduction Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['MrIntroWidget']=o;
    w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id='mr-intro-widget';js.src=f;js.async=1;
    fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','mrintro','${process.env.WIDGET_URL}/widget.js'));
  
  mrintro('init', {
    businessId: '${businessId}',
    env: '${process.env.NODE_ENV}',
    version: '${process.env.WIDGET_VERSION || '1.0.0'}'
  });
</script>
`;

    res.json({
      success: true,
      data: {
        embedCode,
        instructions: [
          'Copy the code above',
          'Paste it just before the closing </body> tag',
          'The widget will appear automatically based on your settings'
        ],
        preview: {
          desktop: `${process.env.WIDGET_URL}/preview/${businessId}?device=desktop`,
          mobile: `${process.env.WIDGET_URL}/preview/${businessId}?device=mobile`
        }
      }
    });
  } catch (error) {
    console.error('Get embed code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate embed code! 😢'
    });
  }
};

// Helper function to generate claim code 🎫
const generateClaimCode = (businessId, couponId, customerId) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${businessId.substr(-4)}-${couponId.substr(-4)}-${timestamp}-${random}`.toUpperCase();
};

// Admin: Create/Update business widget 👑
const manageBusinessWidget = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can manage business widgets! 🚫'
      });
    }

    const { businessId } = req.params;
    const {
      logo,
      theme,
      position,
      timing,
      animation,
      colors,
      displayRules,
      linkedVouchers
    } = req.body;

    // Check if business exists
    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business' 
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    // Handle logo upload if provided
    let logoUrl = logo;
    if (req.file) {
      logoUrl = await uploadToFirebase(req.file, `widgets/${businessId}`);
    }

    // Update business widget settings
    const updatedBusiness = await User.findOneAndUpdate(
      { _id: businessId },
      {
        $set: {
          'businessProfile.logo': logoUrl || business.businessProfile?.logo,
          'businessProfile.widgetTheme': theme,
          'businessProfile.widgetSettings': {
            position,
            timing,
            animation,
            colors: colors || {
              primary: '#4CAF50',
              secondary: '#2196F3',
              text: '#000000'
            },
            displayRules,
            linkedVouchers,
            updatedAt: new Date()
          }
        }
      },
      { new: true }
    ).select('businessProfile');

    res.json({
      success: true,
      message: 'Business widget updated successfully! 🎨',
      data: {
        businessId,
        widgetSettings: updatedBusiness.businessProfile.widgetSettings,
        theme: updatedBusiness.businessProfile.widgetTheme,
        logo: updatedBusiness.businessProfile.logo
      }
    });
  } catch (error) {
    console.error('Manage business widget error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage business widget! 😢'
    });
  }
};

// Admin: Get all business widgets 📋
const getAllBusinessWidgets = async (req, res) => {
  try {
    // Check if user is admin 👮
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view all widgets! 🚫'
      });
    }

    // Get pagination parameters 📄
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get search and filter parameters 🔍
    const search = req.query.search || '';
    const status = req.query.status;
    const theme = req.query.theme;

    // Build query
    const query = { role: 'business' };

    if (search) {
      query.$or = [
        { 'businessProfile.businessName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query['businessProfile.status'] = status;
    }

    if (theme) {
      query['businessProfile.widgetTheme'] = theme;
    }

    // Get businesses with widgets
    const businesses = await User.find(query)
      .select('businessProfile email firstName lastName businessName')
      .sort({ 'businessProfile.updatedAt': -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    // Get active vouchers for each business
    const businessWidgets = await Promise.all(
      businesses.map(async (business) => {
        const activeVouchers = await Coupon.find({
          businessId: business._id,
          isActive: true,
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() }
        }).select('title description discountType discountValue');

        // Default widget settings 🎨
        const defaultColors = {
          primary: '#4CAF50',
          secondary: '#2196F3',
          text: '#000000'
        };

        const defaultDisplayRules = {
          delay: 0,
          scrollPercentage: 0,
          showOnMobile: true,
          showOnDesktop: true
        };

        return {
          id: business._id,
          email: business.email,
          businessName: business.businessProfile?.businessName || business.businessName || 'Unnamed Business',
          businessDetails: {
            firstName: business.firstName || '',
            lastName: business.lastName || '',
            phone: business.businessProfile?.phoneNumber || '',
            address: business.businessProfile?.businessLocation?.address || '',
            category: business.businessProfile?.businessCategory || ''
          },
          widget: {
            logo: business.businessProfile?.logo || null,
            theme: business.businessProfile?.widgetTheme || 'light',
            settings: {
              position: business.businessProfile?.widgetSettings?.position || 'bottom-right',
              timing: business.businessProfile?.widgetSettings?.timing || 'immediate',
              animation: business.businessProfile?.widgetSettings?.animation || 'slide',
              colors: {
                ...defaultColors,
                ...business.businessProfile?.widgetSettings?.colors
              },
              displayRules: {
                ...defaultDisplayRules,
                ...business.businessProfile?.widgetSettings?.displayRules
              }
            }
          },
          activeVouchers: activeVouchers.map(v => ({
            id: v._id,
            title: v.title,
            description: v.description,
            discount: {
              type: v.discountType,
              value: v.discountValue
            }
          })),
          status: business.businessProfile?.status || 'active',
          createdAt: business.createdAt
        };
      })
    );

    res.json({
      success: true,
      data: {
        widgets: businessWidgets,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get all business widgets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business widgets! 😢'
    });
  }
};

// Admin: Get specific business widget details 🔍
const getBusinessWidgetDetails = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view widget details! 🚫'
      });
    }

    const { businessId } = req.params;

    // Get business details
    const business = await User.findOne({
      _id: businessId,
      role: 'business'
    }).select('businessProfile email');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    // Get active vouchers
    const activeVouchers = await Coupon.find({
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).select('title description discountType discountValue startDate endDate');

    // Get widget performance metrics (if you have them)
    const metrics = {
      views: 0, // Implement view tracking
      clicks: 0, // Implement click tracking
      conversions: 0, // Implement conversion tracking
      // Add more metrics as needed
    };

    res.json({
      success: true,
      data: {
        business: {
          id: business._id,
          email: business.email,
          name: business.businessProfile?.businessName
        },
        widget: {
          logo: business.businessProfile?.logo,
          theme: business.businessProfile?.widgetTheme,
          settings: business.businessProfile?.widgetSettings
        },
        vouchers: activeVouchers.map(v => ({
          id: v._id,
          title: v.title,
          description: v.description,
          discount: {
            type: v.discountType,
            value: v.discountValue
          },
          validity: {
            start: v.startDate,
            end: v.endDate
          }
        })),
        metrics,
        previewUrl: `${process.env.WIDGET_URL}/preview/${businessId}`
      }
    });
  } catch (error) {
    console.error('Get business widget details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget details! 😢'
    });
  }
};

// 🎟️ Helper function for temporary wallet URLs
const getTemporaryWalletUrls = (claimCode) => {
  return {
    apple: `https://example.com/wallet/apple/${claimCode}`, // 🍎 Placeholder for Apple Wallet
    google: `https://example.com/wallet/google/${claimCode}` // 🤖 Placeholder for Google Wallet
  };
};

// Business: Link/Unlink vouchers with widget 🔗
const linkVouchersToWidget = async (req, res) => {
  try {
    const { linkedVouchers } = req.body;
    const businessId = req.user.userId;

    // Validate input
    if (!Array.isArray(linkedVouchers)) {
      return res.status(400).json({
        success: false,
        message: 'linkedVouchers must be an array! 🚫'
      });
    }

    // Validate if voucher belongs to the business
    const validVoucher = await Coupon.findOne({
      _id: linkedVouchers[0],
      businessId,
      isActive: true
    });

    if (!validVoucher) {
      return res.status(400).json({
        success: false,
        message: 'Voucher not found or does not belong to your business! 🚫'
      });
    }

    // Get business with current widget settings
    const business = await User.findById(businessId).populate('businessProfile.widgetSettings.linkedVouchers');
    
    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    // Initialize widgetSettings if not exists
    if (!business.businessProfile) {
      business.businessProfile = {};
    }
    if (!business.businessProfile.widgetSettings) {
      business.businessProfile.widgetSettings = {
        position: 'bottom-right',
        timing: 'immediate',
        animation: 'slide',
        colors: {
          primary: '#4CAF50',
          secondary: '#2196F3',
          text: '#000000'
        },
        displayRules: {
          delay: 0,
          scrollPercentage: 0,
          showOnMobile: true,
          showOnDesktop: true
        },
        linkedVouchers: []
      };
    }

    // Update linked vouchers
    business.businessProfile.widgetSettings.linkedVouchers = linkedVouchers;
    business.businessProfile.widgetSettings.updatedAt = new Date();

    // Save the changes
    await business.save();

    // Get updated voucher details
    const updatedVoucher = await Coupon.findById(linkedVouchers[0])
      .select('title description discountType discountValue startDate endDate maxRedemptions currentRedemptions');

    res.json({
      success: true,
      message: 'Voucher linked with widget successfully! 🎉',
      data: {
        linkedVoucher: {
          id: updatedVoucher._id,
          title: updatedVoucher.title,
          description: updatedVoucher.description,
          discount: {
            type: updatedVoucher.discountType,
            value: updatedVoucher.discountValue
          },
          validity: {
            start: updatedVoucher.startDate,
            end: updatedVoucher.endDate
          },
          redemptions: {
            max: updatedVoucher.maxRedemptions || 'unlimited',
            current: updatedVoucher.currentRedemptions,
            remaining: updatedVoucher.maxRedemptions ? 
              updatedVoucher.maxRedemptions - updatedVoucher.currentRedemptions : 
              'unlimited'
          }
        }
      }
    });
  } catch (error) {
    console.error('Link vouchers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link voucher with widget! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Business: Get own widget details with vouchers 🎯
const getBusinessOwnWidget = async (req, res) => {
  try {
    const businessId = req.user.userId;

    // Get business details with widget settings
    const business = await User.findOne({ 
      _id: businessId,
      role: 'business' 
    }).select('businessProfile email businessName picUrl');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business profile not found! 🏢'
      });
    }

    // Get all active vouchers for the business
    const allVouchers = await Coupon.find({
      businessId,
      isActive: true,
      endDate: { $gte: new Date() }
    }).select('title description discountType discountValue startDate endDate maxRedemptions currentRedemptions');

    // Get linked voucher IDs
    const linkedVoucherIds = business.businessProfile?.widgetSettings?.linkedVouchers || [];

    // Separate linked and unlinked vouchers
    const { linkedVouchers, unlinkedVouchers } = allVouchers.reduce((acc, voucher) => {
      if (linkedVoucherIds.includes(voucher._id.toString())) {
        acc.linkedVouchers.push(voucher);
      } else {
        acc.unlinkedVouchers.push(voucher);
      }
      return acc;
    }, { linkedVouchers: [], unlinkedVouchers: [] });

    // Format voucher data
    const formatVoucher = (voucher) => ({
      id: voucher._id,
      title: voucher.title,
      description: voucher.description,
      discount: {
        type: voucher.discountType,
        value: voucher.discountValue
      },
      validity: {
        start: voucher.startDate,
        end: voucher.endDate
      },
      redemptions: {
        max: voucher.maxRedemptions || 'unlimited',
        current: voucher.currentRedemptions,
        remaining: voucher.maxRedemptions ? 
          voucher.maxRedemptions - voucher.currentRedemptions : 
          'unlimited'
      }
    });

    res.json({
      success: true,
      data: {
        business: {
          id: business._id,
          email: business.email,
          name: business.businessName || business.businessProfile?.businessName,
          logo: business.picUrl || business.businessProfile?.logo
        },
        widget: {
          theme: business.businessProfile?.widgetTheme || 'light',
          settings: {
            position: business.businessProfile?.widgetSettings?.position || 'bottom-right',
            timing: business.businessProfile?.widgetSettings?.timing || 'immediate',
            animation: business.businessProfile?.widgetSettings?.animation || 'slide',
            colors: business.businessProfile?.widgetSettings?.colors || {
              primary: '#4CAF50',
              secondary: '#2196F3',
              text: '#000000'
            },
            displayRules: business.businessProfile?.widgetSettings?.displayRules || {
              delay: 0,
              scrollPercentage: 0,
              showOnMobile: true,
              showOnDesktop: true
            }
          }
        },
        vouchers: {
          linked: linkedVouchers.map(formatVoucher),
          unlinked: unlinkedVouchers.map(formatVoucher)
        },
        embedCode: generateEmbedCode(business._id), // Helper function to generate embed code
        previewUrl: `${process.env.WIDGET_URL || 'https://widget.example.com'}/preview/${business._id}`
      }
    });
  } catch (error) {
    console.error('Get business widget error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your widget details! 😢'
    });
  }
};

// Helper function to generate embed code 📝
const generateEmbedCode = (businessId) => {
  return `<!-- MrIntroduction Widget -->\n<script>\n  (function(w,d,s,o,f,js,fjs){\n    w['MrIntroWidget']=o;\n    w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};\n    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];\n    js.id='mr-intro-widget';js.src=f;js.async=1;\n    fjs.parentNode.insertBefore(js,fjs);\n  }(window,document,'script','mrintro','https://widget.mrintro.com/widget.js'));\n  \n  mrintro('init', {\n    businessId: '${businessId}',\n    env: '${process.env.NODE_ENV || 'production'}'\n  });\n</script>`;
};

// Admin: Create widget template 🎨
const createTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      settings
    } = req.body;

    // Validate user exists in request
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required! Please log in again. 🔒'
      });
    }

    // Handle thumbnail upload 🖼️
    let thumbnailUrl;
    if (req.file) {
      try {
        thumbnailUrl = await uploadTemplateThumbnail(req.file);
      } catch (uploadError) {
        console.error('Thumbnail upload error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload thumbnail! Please try again. 🖼️'
        });
      }
    } 
    // else {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Thumbnail image is required! 🖼️'
    //   });
    // }

    // Parse and validate settings with defaults
    let parsedSettings = {
      branding: {
        logo: {
          url: settings?.branding?.logo?.url || '',
          width: settings?.branding?.logo?.width || 120,
          height: settings?.branding?.logo?.height || 40,
          position: settings?.branding?.logo?.position || 'top'
        },
        businessName: {
          show: settings?.branding?.businessName?.show ?? true,
          fontSize: settings?.branding?.businessName?.fontSize || 24,
          fontWeight: settings?.branding?.businessName?.fontWeight || 'bold'
        }
      },
      offer: {
        title: {
          text: settings?.offer?.title?.text || '15% OFF BILL',
          fontSize: settings?.offer?.title?.fontSize || 32,
          fontWeight: settings?.offer?.title?.fontWeight || 'bold'
        },
        description: {
          text: settings?.offer?.description?.text || 'Get reward 15% OFF EVERYTHING! for the first visit!',
          fontSize: settings?.offer?.description?.fontSize || 16
        }
      },
      qrCode: {
        size: settings?.qrCode?.size || 'medium',
        position: settings?.qrCode?.position || 'center',
        style: settings?.qrCode?.style || 'standard',
        backgroundColor: settings?.qrCode?.backgroundColor || '#FFFFFF',
        foregroundColor: settings?.qrCode?.foregroundColor || '#000000',
        margin: settings?.qrCode?.margin || 20,
        errorCorrectionLevel: settings?.qrCode?.errorCorrectionLevel || 'M'
      },
      walletIntegration: {
        enabled: settings?.walletIntegration?.enabled ?? true,
        types: {
          apple: {
            enabled: settings?.walletIntegration?.types?.apple?.enabled ?? true,
            buttonStyle: settings?.walletIntegration?.types?.apple?.buttonStyle || 'black'
          },
          google: {
            enabled: settings?.walletIntegration?.types?.google?.enabled ?? true,
            buttonStyle: settings?.walletIntegration?.types?.google?.buttonStyle || 'black'
          }
        },
        position: settings?.walletIntegration?.position || 'bottom'
      },
      design: {
        layout: {
          type: settings?.design?.layout?.type || 'standard',
          spacing: settings?.design?.layout?.spacing || 20,
          padding: settings?.design?.layout?.padding || 24
        },
        colors: {
          primary: settings?.design?.colors?.primary || '#000000',
          secondary: settings?.design?.colors?.secondary || '#FFFFFF',
          background: settings?.design?.colors?.background || '#FFFFFF',
          text: settings?.design?.colors?.text || '#000000'
        },
        typography: {
          fontFamily: settings?.design?.typography?.fontFamily || 'Inter',
          scale: settings?.design?.typography?.scale || 'medium'
        },
        borderRadius: settings?.design?.borderRadius || 8,
        shadow: {
          enabled: settings?.design?.shadow?.enabled ?? true,
          intensity: settings?.design?.shadow?.intensity || 'medium'
        }
      },
      pwa: {
        enabled: settings?.pwa?.enabled ?? true,
        icon: settings?.pwa?.icon || '',
        backgroundColor: settings?.pwa?.backgroundColor || '#FFFFFF',
        themeColor: settings?.pwa?.themeColor || '#000000'
      },
      display: {
        position: settings?.display?.position || 'bottom-right',
        animation: settings?.display?.animation || 'fade',
        timing: {
          delay: settings?.display?.timing?.delay || 0,
          duration: settings?.display?.timing?.duration || 5000
        },
        responsive: {
          mobile: {
            enabled: settings?.display?.responsive?.mobile?.enabled ?? true,
            breakpoint: settings?.display?.responsive?.mobile?.breakpoint || 768
          },
          desktop: {
            enabled: settings?.display?.responsive?.desktop?.enabled ?? true
          }
        }
      },
      support: {
        contactNumber: settings?.support?.contactNumber || '',
        helpText: settings?.support?.helpText || 'In case of technical failures, call:'
      }
    };

    // Create template with validated data
    const template = new WidgetTemplate({
      name,
      description,
      category,
      thumbnail: thumbnailUrl,
      createdBy: req.user.userId,
      settings: parsedSettings
    });

    // Save with validation
    await template.save();

    // Populate creator details for response
    await template.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Widget template created successfully! 🎉',
      data: template
    });
  } catch (error) {
    console.error('Create template error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed! Please check your input. ❌',
        errors: validationErrors
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create widget template! 😢'
    });
  }
};

// Admin: Update widget template 🔄
const updateTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      isActive,
      settings
    } = req.body;

    const template = await WidgetTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found! 🔍'
      });
    }

    // Handle thumbnail update if provided
    if (req.file) {
      template.thumbnail = await uploadTemplateThumbnail(req.file);
    }

    // Update fields
    template.name = name || template.name;
    template.description = description || template.description;
    template.category = category || template.category;
    template.isActive = isActive !== undefined ? isActive === 'true' : template.isActive;
    template.settings = settings ? JSON.parse(settings) : template.settings;

    await template.save();

    res.json({
      success: true,
      message: 'Widget template updated successfully! ✨',
      data: template
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update widget template! 😢'
    });
  }
};

// Admin: Delete widget template 🗑️
const deleteTemplate = async (req, res) => {
  try {
    const template = await WidgetTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found! 🔍'
      });
    }

    // TODO: Delete thumbnail from Firebase storage if needed
    await template.deleteOne();

    res.json({
      success: true,
      message: 'Widget template deleted successfully! 🗑️'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete widget template! 😢'
    });
  }
};

// Admin: Get all templates with filters 📋
const getAllTemplates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      search,
      isActive
    } = req.query;

    const query = {};
    
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [templates, total] = await Promise.all([
      WidgetTemplate.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('createdBy', 'firstName lastName'),
      WidgetTemplate.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget templates! 😢'
    });
  }
};

// Get single template details 🔍
const getTemplateById = async (req, res) => {
  try {
    const template = await WidgetTemplate.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found! 🔍'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch widget template! 😢'
    });
  }
};

// Business: Get active templates 🎯
const getActiveTemplates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category
    } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const [templates, total] = await Promise.all([
      WidgetTemplate.find(query)
        .select('-createdBy')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      WidgetTemplate.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get active templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active templates! 😢'
    });
  }
};

module.exports = {
  getWidgetConfig,
  claimVoucher,
  getCustomizationOptions,
  updateWidgetAppearance,
  getEmbedCode,
  linkVouchersToWidget,
  manageBusinessWidget,
  getAllBusinessWidgets,
  getBusinessWidgetDetails,
  getBusinessOwnWidget,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAllTemplates,
  getTemplateById,
  getActiveTemplates
}; 