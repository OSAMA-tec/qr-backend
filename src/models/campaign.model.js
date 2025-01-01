// Import dependencies 📦
const mongoose = require('mongoose');

// Campaign Analytics Schema 📊
const analyticsSchema = new mongoose.Schema({
  totalClicks: { type: Number, default: 0 },
  uniqueClicks: { type: Number, default: 0 },
  formViews: { type: Number, default: 0 },
  formSubmissions: { type: Number, default: 0 },
  conversionRate: { type: Number, default: 0 },
  bounceRate: { type: Number, default: 0 },
  averageFormFillTime: { type: Number, default: 0 }, // in seconds
  deviceStats: {
    desktop: { type: Number, default: 0 },
    mobile: { type: Number, default: 0 },
    tablet: { type: Number, default: 0 }
  },
  browserStats: {
    type: Map,
    of: Number,
    default: {}
  },
  locationStats: {
    type: Map,
    of: Number,
    default: {}
  },
  timeStats: {
    hourly: [Number], // 24 slots for each hour
    daily: [Number],  // 7 slots for each day of week
    monthly: [Number] // 12 slots for each month
  }
});

// Campaign Schema 🎯
const campaignSchema = new mongoose.Schema({
  // Basic Info
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['referral', 'influencer', 'partner'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed'],
    default: 'draft'
  },

  // Campaign Details
  description: String,
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },

  // Referral Links
  referralLinks: [{
    code: {
      type: String,
      required: true
    },
    influencerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    influencerName: String,
    influencerType: {
      type: String,
      enum: ['individual', 'company', 'partner'],
      required: true
    },
    platform: {
      type: String,
      enum: ['instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'other'],
      required: true
    },
    analytics: analyticsSchema,
    customFields: {
      type: Map,
      of: String
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Form Configuration
  formConfig: {
    fields: [{
      _id: false, // Disable automatic _id generation
      name: String,
      label: String,
      type: {
        type: String,
        enum: ['text', 'email', 'phone', 'date', 'select', 'checkbox'],
        required: true
      },
      isRequired: {
        type: Boolean,
        default: false
      },
      options: [String], // For select fields
      validation: {
        pattern: String,
        message: String
      }
    }],
    theme: {
      primaryColor: String,
      secondaryColor: String,
      backgroundColor: String,
      textColor: String
    },
    redirectUrl: String,
    successMessage: String
  },

  // Campaign Analytics
  analytics: analyticsSchema,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes 📇
campaignSchema.index({ businessId: 1, status: 1 });
campaignSchema.index({ 'referralLinks.code': 1 }); // Unique index for referral codes
campaignSchema.index({ startDate: 1, endDate: 1 });

// Pre-save middleware to update timestamps ⏰
campaignSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-save middleware to ensure unique referral codes 🎫
campaignSchema.pre('save', async function(next) {
  // Only check for duplicates if referral links are modified
  if (!this.isModified('referralLinks')) {
    return next();
  }

  // Get all referral codes in this document
  const codes = this.referralLinks.map(link => link.code);
  
  // Check for duplicates within the document
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    return next(new Error('Duplicate referral codes are not allowed within a campaign! 🚫'));
  }

  // Check for duplicates in other documents
  const Campaign = this.constructor;
  for (const code of codes) {
    const existingCampaign = await Campaign.findOne({
      '_id': { $ne: this._id }, // Exclude current document
      'referralLinks.code': code
    });

    if (existingCampaign) {
      return next(new Error(`Referral code ${code} is already in use! 🚫`));
    }
  }

  next();
});

// Create model 🏗️
const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign; 