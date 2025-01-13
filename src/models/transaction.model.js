// Import dependencies 📦
const mongoose = require('mongoose');

// Transaction Schema 💰
const transactionSchema = new mongoose.Schema({
  // Reference Info
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    
  },

  // Transaction Details
  transactionDate: {
    type: Date,
    default: Date.now
  },
  originalAmount: {
    type: Number,
    
  },
  discountAmount: {
    type: Number,
    
  },
  finalAmount: {
    type: Number,
  },

  // Transaction Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'refunded'],
    default: 'completed'
  },

  // Location Info
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      
    },
    address: String
  },

  // Additional Info
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'digital_wallet'],
    default:'cash'
  },
  items: [{
    name: String,
    quantity: Number,
    price: Number,
    subtotal: Number
  }],
  
  // Metadata
  deviceInfo: {
    type: String,
    platform: String,
    browser: String
  },

  // Notes & References
  referenceNumber: {
    type: String,

  },
  notes: String,

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes 📇
transactionSchema.index({ couponId: 1, customerId: 1 });
transactionSchema.index({ businessId: 1 });
transactionSchema.index({ transactionDate: 1 });
transactionSchema.index({ location: '2dsphere' });

// Create model 🏗️
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction; 