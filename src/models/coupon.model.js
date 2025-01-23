// Import dependencies 📦
const mongoose = require('mongoose');

// Coupon Schema 🎟
const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Voucher code is required! 📝'],
    trim: true,
    uppercase: true
  },
  title: {
    type: String,
    required: [true, 'Voucher title is required! 📌'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters long'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Voucher description is required! 📄'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Business reference is required! 🏢']
  },
  widgetTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WidgetTemplate',
    required: [true, 'Widget template reference is required! 🎨']
  },
  discountType: {
    type: String,
    enum: {
      values: ['percentage', 'fixed'],
      message: 'Invalid discount type! Must be percentage or fixed'
    },
    required: [true, 'Discount type is required! 💰']
  },
  discountValue: {
    type: Number,
    required: [true, 'Discount value is required! 💯'],
    min: [0, 'Discount value cannot be negative'],
    validate: {
      validator: function(v) {
        return this.discountType !== 'percentage' || v <= 100;
      },
      message: 'Percentage discount cannot exceed 100%!'
    }
  },
  minimumPurchase: {
    type: Number,
    min: [0, 'Minimum purchase amount cannot be negative'],
    default: 0
  },
  maximumDiscount: {
    type: Number,
    min: [0, 'Maximum discount amount cannot be negative']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required! 📅'],
    validate: {
      validator: function(v) {
        return v >= new Date();
      },
      message: 'Start date must be in the future!'
    }
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
  isActive: {
    type: Boolean,
    default: true
  },
  usedTrue: {
    type: Boolean,
    default: false
  },
  usageLimit: {
    perCoupon: {
      type: Number,
      min: [0, 'Usage limit cannot be negative']
    },
    perCustomer: {
      type: Number,
      min: [0, 'Per customer limit cannot be negative']
    }
  },
  currentUsage: {
    type: Number,
    default: 0
  },
  qrCode: {
    data: String,
    url: String
  },
  analytics: {
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    redemptions: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 }
  },
  // Question and Answers for Voucher 📝
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
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ businessId: 1 });
couponSchema.index({ widgetTemplateId: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });
couponSchema.index({ createdAt: -1 });

// Methods 🛠️
couponSchema.methods.toJSON = function() {
  const coupon = this.toObject();
  delete coupon.__v;
  return coupon;
};

// Pre-save middleware to validate dates 📅
couponSchema.pre('save', function(next) {
  if (this.isModified('startDate') || this.isModified('endDate')) {
    if (this.startDate >= this.endDate) {
      next(new Error('End date must be after start date! ⚠️'));
    }
  }
  next();
});

// Create model 🏗️
const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon; 