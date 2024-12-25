// Import dependencies 📦
const mongoose = require('mongoose');

// Subscription Plan Schema 💳
const subscriptionPlanSchema = new mongoose.Schema({
  // Plan Info
  name: {
    type: String,
    required: true,
    enum: ['free', 'basic', 'premium', 'enterprise']
  },
  description: String,
  
  // Pricing
  price: {
    amount: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: true
  },

  // Features & Limits
  features: {
    maxCoupons: Number,
    maxQRCodes: Number,
    analyticsAccess: Boolean,
    customBranding: Boolean,
    apiAccess: Boolean,
    prioritySupport: Boolean,
    marketplaceAccess: Boolean,
    maxLocations: Number,
    walletIntegration: Boolean
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Subscription Schema 📋
const subscriptionSchema = new mongoose.Schema({
  // User Reference
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Stripe Info
  stripeCustomerId: {
    type: String,
    required: true
  },
  stripeSubscriptionId: {
    type: String,
    required: true
  },

  // Plan Info
  plan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid'],
    default: 'active'
  },

  // Billing
  billing: {
    cycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    }
  },

  // Payment History
  paymentHistory: [{
    amount: Number,
    currency: String,
    date: Date,
    status: {
      type: String,
      enum: ['succeeded', 'failed', 'pending']
    },
    invoiceUrl: String
  }],

  // Usage Stats
  usage: {
    couponsCreated: {
      type: Number,
      default: 0
    },
    qrCodesGenerated: {
      type: Number,
      default: 0
    },
    totalRedemptions: {
      type: Number,
      default: 0
    }
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes 📇
subscriptionSchema.index({ businessId: 1 });
subscriptionSchema.index({ 'billing.currentPeriodEnd': 1 });
subscriptionSchema.index({ status: 1 });

// Create models 🏗️
const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = {
  SubscriptionPlan,
  Subscription
}; 