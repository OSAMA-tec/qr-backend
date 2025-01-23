// Import dependencies 📦
const mongoose = require('mongoose');
const crypto = require('crypto');

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
      values: ['referral', 'influencer', 'partner'],
      message: 'Invalid campaign type! Must be: referral, influencer, or partner'
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
  analytics: {
    totalClicks: { type: Number, default: 0 },
    uniqueClicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    avgOrderValue: { type: Number, default: 0 }
  },
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
      enum: ['male', 'female', 'other']
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
  }]
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

// Create model 🏗️
const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign; 