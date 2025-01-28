// Import dependencies 📦
const mongoose = require('mongoose');

// Subscription Plan Schema 💳
const subscriptionPlanSchema = new mongoose.Schema({
  // Plan Info
  name: {
    type: String,
    required: true,
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
  },

  // Stripe Info
  stripeCustomerId: {
    type: String,
  },
  stripeSubscriptionId: {
    type: String,
  },

  // Plan Info
  plan: {
    type: String,
  },

  // Status
  status: {
    type: String,
    default: 'active'
  },

  // Billing
  billing: {
    cycle: {
      type: String,
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