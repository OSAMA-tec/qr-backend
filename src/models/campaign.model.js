// Import dependencies 📦
const mongoose = require('mongoose');
const crypto = require('crypto');

// Analytics schema for better structure 📊
const analyticsSchema = new mongoose.Schema({
  totalClicks: { type: Number, default: 0 },
  uniqueClicks: { type: Number, default: 0 },
  formViews: { type: Number, default: 0 },
  formSubmissions: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  conversionRate: { type: Number, default: 0 },
  deviceStats: {
    desktop: { type: Number, default: 0 },
    mobile: { type: Number, default: 0 },
    tablet: { type: Number, default: 0 }
  },
  browserStats: {
    chrome: { type: Number, default: 0 },
    firefox: { type: Number, default: 0 },
    safari: { type: Number, default: 0 },
    edge: { type: Number, default: 0 },
    opera: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  locationStats: {
    type: Map,
    of: Number,
    default: new Map()
  },
  timeStats: {
    hourly: { type: [Number], default: Array(24).fill(0) },
    daily: { type: [Number], default: Array(7).fill(0) },
    monthly: { type: [Number], default: Array(12).fill(0) }
  }
});

// Campaign Schema 🎯
const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Campaign name is required! 📝'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Campaign description is required! 📄'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Business reference is required! 🏢']
  },
  voucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: [true, 'Voucher reference is required! 🎫']
  },
  type: {
    type: String,
    enum: {
      values: ['referral', 'influencer', 'partner', 'google_ads', 'agency', 'business'],
      message: 'Invalid campaign type! Must be one of: referral, influencer, partner, google_ads, agency, business'
    },
    required: [true, 'Campaign type is required! 📊']
  },
  status: {
    type: String,
    enum: {
      values: ['draft', 'active', 'paused', 'completed', 'cancelled'],
      message: 'Invalid campaign status!'
    },
    default: 'draft'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required! 📅'],
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required! 📅'],
    validate: {
      validator: function(v) {
        return v > this.startDate;
      },
      message: 'End date must be after start date!'
    }
  },
  influencers: [{
    name: {
      type: String,
      required: [true, 'Influencer name is required! 👤'],
      trim: true
    },
    type: {
      type: String,
      enum: {
        values: ['individual', 'company', 'partner'],
        message: 'Invalid influencer type!'
      }
    },
    platform: {
      type: String,
      enum: {
        values: ['instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'other'],
        message: 'Invalid platform!'
      }
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    stats: {
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }
  }],
  formConfig: {
    fields: [{
      name: String,
      type: {
        type: String,
        enum: ['text', 'email', 'phone', 'date', 'select', 'checkbox']
      },
      required: Boolean,
      options: [String] // For select fields
    }]
  },
  analytics: { type: analyticsSchema, default: () => ({}) },
  budget: {
    total: Number,
    spent: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 }
  },
  targeting: {
    ageRange: {
      min: { type: Number, min: 0, max: 100 },
      max: { type: Number, min: 0, max: 100 }
    },
    gender: [{
      type: String,
    }],
    locations: [{
      type: String,
      trim: true
    }],
    interests: [String]
  },
  // Question and Answers for Campaign 📝
  question: {
    text: {
      type: String,
      trim: true
    },
    isRequired: {
      type: Boolean,
      default: false
    }
  },
  answers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answer: {
      type: String,
      trim: true,
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Campaign Type Specific Details
  googleAdsDetails: {
    adsId: {
      type: String,
      required: function() {
        return this.type === 'google_ads';
      }
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    stats: {
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }
  },
  agencyDetails: {
    name: {
      type: String,
      required: function() {
        return this.type === 'agency';
      }
    },
    contactPerson: {
      name: String,
      email: String,
      phone: String
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    stats: {
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }
  },
  businessDetails: {
    name: {
      type: String,
      required: function() {
        return this.type === 'business';
      }
    },
    contactPerson: {
      name: String,
      email: String,
      phone: String
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    stats: {
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
});

// Indexes for faster queries 🔍
campaignSchema.index({ businessId: 1 });
campaignSchema.index({ voucherId: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ startDate: 1, endDate: 1 });
campaignSchema.index({ createdAt: -1 });

// Methods 🛠️
campaignSchema.methods.toJSON = function() {
  const campaign = this.toObject();
  delete campaign.__v;
  return campaign;
};

// Pre-save middleware to validate dates and update budget 📅
campaignSchema.pre('save', function(next) {
  // Validate dates
  if (this.isModified('startDate') || this.isModified('endDate')) {
    if (this.startDate >= this.endDate) {
      next(new Error('End date must be after start date! ⚠️'));
    }
  }

  // Update budget remaining
  if (this.isModified('budget.total') || this.isModified('budget.spent')) {
    this.budget.remaining = this.budget.total - this.budget.spent;
  }

  // Update conversion rate
  if (this.isModified('analytics.conversions') || this.isModified('analytics.uniqueClicks')) {
    if (this.analytics.uniqueClicks > 0) {
      this.analytics.conversionRate = (this.analytics.conversions / this.analytics.uniqueClicks) * 100;
    }
  }

  // Update average order value
  if (this.isModified('analytics.revenue') || this.isModified('analytics.conversions')) {
    if (this.analytics.conversions > 0) {
      this.analytics.avgOrderValue = this.analytics.revenue / this.analytics.conversions;
    }
  }

  next();
});

// Pre-save middleware to generate referral codes 🎫
campaignSchema.pre('save', async function(next) {
  if (this.isModified('influencers')) {
    for (const influencer of this.influencers) {
      if (!influencer.referralCode) {
        // Generate unique referral code
        const prefix = influencer.name.substring(0, 3).toUpperCase();
        const hash = crypto.createHash('md5')
          .update(this._id + influencer.name + Date.now())
          .digest('hex')
          .substring(0, 6);
        influencer.referralCode = `${prefix}-${hash}`;
      }
    }
  }
  next();
});

// Method to track click analytics 🖱️
campaignSchema.methods.trackClick = function(deviceInfo, browserInfo, location) {
  // Initialize analytics if not exists
  if (!this.analytics) {
    this.analytics = {};
  }

  // Update basic metrics
  this.analytics.totalClicks = (this.analytics.totalClicks || 0) + 1;
  this.analytics.uniqueClicks = (this.analytics.uniqueClicks || 0) + 1;

  // Track device stats
  const deviceType = deviceInfo?.type || 'other';
  if (!this.analytics.deviceStats) {
    this.analytics.deviceStats = { desktop: 0, mobile: 0, tablet: 0 };
  }
  this.analytics.deviceStats[deviceType] = (this.analytics.deviceStats[deviceType] || 0) + 1;

  // Track browser stats
  const browserName = (browserInfo?.browser || 'other').toLowerCase();
  const supportedBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'opera'];
  const browserKey = supportedBrowsers.includes(browserName) ? browserName : 'other';
  
  if (!this.analytics.browserStats) {
    this.analytics.browserStats = {
      chrome: 0, firefox: 0, safari: 0, edge: 0, opera: 0, other: 0
    };
  }
  this.analytics.browserStats[browserKey] = (this.analytics.browserStats[browserKey] || 0) + 1;

  // Track location stats
  if (!this.analytics.locationStats) {
    this.analytics.locationStats = new Map();
  }
  const locationKey = location?.country?.toLowerCase() || 'unknown';
  this.analytics.locationStats.set(
    locationKey, 
    (this.analytics.locationStats.get(locationKey) || 0) + 1
  );

  // Track time stats
  const now = new Date();
  if (!this.analytics.timeStats) {
    this.analytics.timeStats = {
      hourly: Array(24).fill(0),
      daily: Array(7).fill(0),
      monthly: Array(12).fill(0)
    };
  }

  // Update time-based stats
  this.analytics.timeStats.hourly[now.getHours()]++;
  this.analytics.timeStats.daily[now.getDay()]++;
  this.analytics.timeStats.monthly[now.getMonth()]++;

  // Calculate conversion rate
  if (this.analytics.totalClicks > 0) {
    this.analytics.conversionRate = 
      (this.analytics.conversions / this.analytics.totalClicks) * 100;
  }
};

// Method to track form submission 📝
campaignSchema.methods.trackFormSubmission = function(deviceInfo, browserInfo, location, formFillTime = 0) {
  // Initialize analytics if needed
  if (!this.analytics) {
    this.analytics = {};
  }

  // Update basic metrics
  this.analytics.formSubmissions = (this.analytics.formSubmissions || 0) + 1;
  this.analytics.conversions = (this.analytics.conversions || 0) + 1;

  // Track device, browser, and location
  this.trackClick(deviceInfo, browserInfo, location);

  // Update conversion rate
  if (this.analytics.totalClicks > 0) {
    this.analytics.conversionRate = 
      (this.analytics.conversions / this.analytics.totalClicks) * 100;
  }
};

// Method to get analytics summary 📊
campaignSchema.methods.getAnalyticsSummary = function() {
  return {
    overview: {
      totalClicks: this.analytics?.totalClicks || 0,
      uniqueClicks: this.analytics?.uniqueClicks || 0,
      formViews: this.analytics?.formViews || 0,
      formSubmissions: this.analytics?.formSubmissions || 0,
      conversionRate: this.analytics?.conversionRate?.toFixed(2) || "0.00"
    },
    deviceStats: this.analytics?.deviceStats || { desktop: 0, mobile: 0, tablet: 0 },
    browserStats: this.analytics?.browserStats || {},
    locationStats: Object.fromEntries(this.analytics?.locationStats || new Map()),
    timeStats: this.analytics?.timeStats || {
      hourly: Array(24).fill(0),
      daily: Array(7).fill(0),
      monthly: Array(12).fill(0)
    }
  };
};

// Create model 🏗️
const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign; 