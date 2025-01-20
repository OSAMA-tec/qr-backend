// Import dependencies 📦
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User Schema 👤
const userSchema = new mongoose.Schema({
  // Basic Info
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.isGuest; // Password only required for non-guest users
    }
  },
  role: {
    type: String,
    enum: ['customer', 'business', 'admin'],
    default: 'customer'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  guestDetails: {
    description: String,
    claimedFrom: {
      type: String,
      enum: ['widget', 'popup', 'qr', 'campaign']
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    source: {
      type: {
        type: String,
        enum: ['campaign', 'widget', 'popup', 'qr']
      },
      campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
      },
      campaignName: String,
      influencerId: mongoose.Schema.Types.ObjectId,
      influencerName: String,
      influencerPlatform: String,
      referralCode: String,
      joinedAt: Date
    }
  },
  picUrl: String,
  // Profile Info
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String },
  dateOfBirth: { type: Date },
  
  // Business Profile (if role is business)
  businessProfile: {
    businessName: String,
    description: String,
    category: String,
    logo: String,
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    widgetSettings: {
      position: String,
      timing: String,
      animation: String,
      colors: {
        primary: String,
        secondary: String,
        text: String
      },
      displayRules: {
        delay: Number,
        scrollPercentage: Number
      },
      linkedVouchers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon'
      }],
      updatedAt: Date
    },
    widgetTheme: {
      type: String,
      enum: ['light', 'dark', 'custom'],
      default: 'light'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    }
  },

  // GDPR & Privacy
  gdprConsent: {
    marketing: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    consentDate: { type: Date }
  },

  // Account Status
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  verificationToken: String,
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  // Subscription Info (for business users)
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'premium', 'enterprise'] },
    status: { type: String, enum: ['active', 'inactive', 'cancelled', 'suspended'] },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodEnd: Date
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // 🎫 Track claimed vouchers
  voucherClaims: [{
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    claimDate: {
      type: Date,
      default: Date.now
    },
    claimMethod: {
      type: String,
      enum: ['popup', 'qr', 'link'],
      required: true
    },
    status: {
      type: String,
      enum: ['claimed', 'redeemed', 'expired'],
      default: 'claimed'
    },
    redeemedDate: Date,
    expiryDate: Date,
    analytics: {
      clickDate: Date,
      viewDate: Date,
      redeemDate: Date
    }
  }]
});

// Indexes 📇
userSchema.index({ verificationToken: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ 'subscription.stripeCustomerId': 1 });
userSchema.index({ role: 1 });
userSchema.index({ businessCategory: 1 });

// Password hashing middleware 🔒
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method 🔍
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Create model 🏗️
const User = mongoose.model('User', userSchema);

module.exports = User; 