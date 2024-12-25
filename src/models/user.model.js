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
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['customer', 'business', 'admin'],
    default: 'customer'
  },
  
  // Profile Info
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String },
  dateOfBirth: { type: Date },
  
  // Business Profile (if role is business)
  businessName: String,
  businessDescription: String,
  businessCategory: String,
  businessLocation: {
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
  updatedAt: { type: Date, default: Date.now }
});

// Indexes 📇
userSchema.index({ email: 1 });
userSchema.index({ verificationToken: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ 'subscription.stripeCustomerId': 1 });

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