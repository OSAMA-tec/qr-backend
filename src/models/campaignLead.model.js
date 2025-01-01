// Import dependencies 📦
const mongoose = require('mongoose');

// Campaign Lead Schema 👥
const campaignLeadSchema = new mongoose.Schema({
  // Campaign Info
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  referralCode: {
    type: String,
    required: true,
    index: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Lead Info
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'converted', 'rejected'],
    default: 'pending'
  },
  formData: {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    phoneNumber: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say']
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },

  // Analytics Data
  analytics: {
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    },
    browser: String,
    os: String,
    ipAddress: String,
    location: {
      country: String,
      city: String,
      region: String
    },
    referrer: String,
    formFillTime: Number, // in seconds
    clickTimestamp: Date,
    formViewTimestamp: Date,
    submissionTimestamp: {
      type: Date,
      default: Date.now
    }
  },

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
campaignLeadSchema.index({ campaignId: 1, status: 1 });
campaignLeadSchema.index({ businessId: 1 });
campaignLeadSchema.index({ 'formData.email': 1 });
campaignLeadSchema.index({ referralCode: 1, createdAt: -1 });

// Pre-save middleware to update timestamps
campaignLeadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Create model 🏗️
const CampaignLead = mongoose.model('CampaignLead', campaignLeadSchema);

module.exports = CampaignLead; 