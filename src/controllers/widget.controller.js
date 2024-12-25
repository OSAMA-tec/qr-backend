// Import dependencies 📦
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');

// Get widget configuration 🔧
const getWidgetConfig = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Find business and their active configuration
    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business',
      isVerified: true 
    }).select('businessProfile');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or not verified! 🏢'
      });
    }

    // Get active coupons for the business
    const activeCoupons = await Coupon.find({
      businessId,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).select('title description discount type maxRedemptions currentRedemptions');

    res.json({
      success: true,
      data: {
        business: {
          name: business.businessProfile.businessName,
          logo: business.businessProfile.logo,
          theme: business.businessProfile.widgetTheme || 'light'
        },
        activeCoupons,
        displaySettings: business.businessProfile.widgetSettings || {
          position: 'bottom-right',
          timing: 'immediate',
          animation: 'slide'
        }
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

// Process voucher claim 🎟️
const claimVoucher = async (req, res) => {
  try {
    const { 
      businessId, 
      couponId, 
      customerEmail, 
      customerName, 
      phoneNumber 
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

    // Find or create customer
    let customer = await User.findOne({ email: customerEmail });
    if (!customer) {
      customer = new User({
        email: customerEmail,
        firstName: customerName.split(' ')[0],
        lastName: customerName.split(' ')[1] || '',
        phoneNumber,
        role: 'customer',
        isVerified: false
      });
      await customer.save();
    }

    // Increment redemption count
    coupon.currentRedemptions += 1;
    await coupon.save();

    // Generate unique code for this claim
    const claimCode = generateClaimCode(businessId, couponId, customer._id);

    res.status(201).json({
      success: true,
      message: 'Voucher claimed successfully! 🎉',
      data: {
        claimCode,
        couponDetails: {
          title: coupon.title,
          discount: coupon.discount,
          validUntil: coupon.endDate
        }
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
    const { businessId } = req.user;

    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business' 
    }).select('businessProfile.widgetSettings');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🏢'
      });
    }

    res.json({
      success: true,
      data: {
        currentSettings: business.businessProfile.widgetSettings || {},
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
    const { businessId } = req.user;
    const {
      theme,
      position,
      timing,
      animation,
      customColors,
      displayRules
    } = req.body;

    const business = await User.findOneAndUpdate(
      { _id: businessId, role: 'business' },
      {
        $set: {
          'businessProfile.widgetSettings': {
            theme,
            position,
            timing,
            animation,
            customColors,
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
      data: business.businessProfile.widgetSettings
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
    const { businessId } = req.user;

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

    // Generate embed code
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
    env: '${process.env.NODE_ENV}'
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
          'The widget will appear automatically'
        ]
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

module.exports = {
  getWidgetConfig,
  claimVoucher,
  getCustomizationOptions,
  updateWidgetAppearance,
  getEmbedCode
}; 