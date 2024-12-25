// Import dependencies 📦
const mongoose = require('mongoose');

// Coupon Schema 🎟️
const couponSchema = new mongoose.Schema({
  // Basic Info
  code: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  
  // Business Info
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // QR Code Info
  qrCode: {
    data: String,  // Base64 encoded QR code image
    url: String,   // URL for the QR code
    walletPass: {
      applePass: String,
      googlePass: String
    }
  },

  // Discount Info
  discountType: {
    type: String,
    enum: ['percentage', 'fixed', 'buyOneGetOne'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true
  },
  minimumPurchase: Number,
  maximumDiscount: Number,

  // Validity
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Usage Limits
  usageLimit: {
    perCoupon: Number,    // Total times this coupon can be used
    perCustomer: Number   // Times each customer can use this
  },
  currentUsage: {
    type: Number,
    default: 0
  },

  // Campaign Info
  campaign: {
    type: String,
    enum: ['regular', 'birthday', 'anniversary', 'seasonal', 'flash'],
    default: 'regular'
  },
  
  // Targeting
  targetAudience: {
    ageRange: {
      min: Number,
      max: Number
    },
    location: {
      type: { type: String },
      coordinates: [Number]  // [longitude, latitude]
    },
    customerType: [{
      type: String,
      enum: ['new', 'existing', 'vip']
    }]
  },

  // Marketplace Settings
  marketplace: {
    isPublic: { type: Boolean, default: false },
    category: String,
    tags: [String],
    featured: { type: Boolean, default: false }
  },

  // Analytics
  analytics: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    redemptions: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 }
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes 📇
couponSchema.index({ 'targetAudience.location': '2dsphere' });
couponSchema.index({ businessId: 1 });
couponSchema.index({ 'marketplace.isPublic': 1, 'marketplace.category': 1 });

// Create model 🏗️
const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon; 