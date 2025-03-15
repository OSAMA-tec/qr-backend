// Import dependencies 📦
const mongoose = require('mongoose');

// SMS Message Schema 📱
const smsSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Message Details
    messageSid: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'failed', 'undelivered'],
        default: 'queued'
    },
    from: {
        type: String,
        required: true
    },
    to: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },

    // Campaign Info
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
    },
    campaignName: String,
    
    // Message Type
    type: {
        type: String,
        enum: ['marketing', 'transactional', 'verification'],
        default: 'marketing'
    },

    // Scheduling
    scheduledAt: Date,
    sentAt: Date,
    deliveredAt: Date,

    // Analytics
    analytics: {
        clicks: {
            type: Number,
            default: 0
        },
        linkClicks: [{
            url: String,
            clickedAt: Date
        }],
        opened: {
            type: Boolean,
            default: false
        },
        openedAt: Date
    },

    // Error Tracking
    errorDetails: {
        code: String,
        message: String,
        timestamp: Date
    },

    // Cost Tracking
    cost: {
        amount: Number,
        currency: {
            type: String,
            default: 'USD'
        }
    },

    // Metadata
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// ============== Indexes for better query performance ==============
smsSchema.index({ businessId: 1, createdAt: -1 });
smsSchema.index({ campaignId: 1 });
smsSchema.index({ status: 1 });
smsSchema.index({ type: 1 });
smsSchema.index({ scheduledAt: 1 });

// ============== Methods ==============
// Update message status
smsSchema.methods.updateStatus = async function(newStatus, deliveryDetails = {}) {
    this.status = newStatus;
    
    if (newStatus === 'sent') {
        this.sentAt = new Date();
    } else if (newStatus === 'delivered') {
        this.deliveredAt = new Date();
    } else if (newStatus === 'failed' || newStatus === 'undelivered') {
        this.errorDetails = {
            ...deliveryDetails,
            timestamp: new Date()
        };
    }

    await this.save();
    return this;
};

// Track link click
smsSchema.methods.trackClick = async function(url) {
    this.analytics.clicks += 1;
    this.analytics.linkClicks.push({
        url,
        clickedAt: new Date()
    });
    await this.save();
    return this;
};

// Track message open
smsSchema.methods.trackOpen = async function() {
    if (!this.analytics.opened) {
        this.analytics.opened = true;
        this.analytics.openedAt = new Date();
        await this.save();
    }
    return this;
};

// Create model 🏗️
const SMS = mongoose.model('SMS', smsSchema);

module.exports = SMS; 

// ============== Business Phone Number Schema ==============
const businessPhoneNumberSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        validate: {
            validator: function(v) {
                return /^\+[1-9]\d{1,14}$/.test(v);
            },
            message: props => `${props.value} is not a valid phone number! Format should be +1234567890`
        }
    },
    // Twilio SID for this number (if purchased through Twilio)
    twilioSid: String,
    // Whether this number is verified with Twilio for sending
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'failed', 'expired'],
        default: 'pending'
    },
    verificationDetails: {
        verificationSid: String,
        verificationCode: String,
        requestedAt: Date,
        expiresAt: Date,
        completedAt: Date,
        attempts: {
            type: Number,
            default: 0
        },
        lastAttemptAt: Date
    },
    // For 10DLC registration (US)
    complianceStatus: {
        type: String,
        enum: ['not_started', 'pending', 'approved', 'rejected'],
        default: 'not_started'
    },
    complianceDetails: {
        registrationType: {
            type: String,
            enum: ['10DLC', 'toll-free', 'international', 'standard'],
        },
        brandSid: String,
        campaignSid: String,
        registrationSid: String,
        submittedAt: Date,
        updatedAt: Date,
        rejectionReason: String
    },
    // For Toll-Free verification (US/Canada)
    tollFreeVerification: {
        status: {
            type: String,
            enum: ['not_verified', 'verification_in_progress', 'approved', 'rejected', 'resubmission_required'],
            default: 'not_verified'
        },
        submissionId: String,
        submittedAt: Date,
        updatedAt: Date,
        rejectionReason: String,
        useCase: {
            description: String,
            category: String,
            optInProcess: String,
            optInExample: String
        },
        businessProfile: {
            legalEntityName: String,
            websiteUrl: String,
            businessType: String
        }
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    numberType: {
        type: String,
        enum: ['local', 'toll-free', 'mobile', 'international'],
        default: 'local'
    },
    capabilities: {
        sms: {
            type: Boolean,
            default: true
        },
        mms: {
            type: Boolean,
            default: false
        },
        voice: {
            type: Boolean,
            default: false
        }
    },
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// Indexes
businessPhoneNumberSchema.index({ businessId: 1, isDefault: 1 });
businessPhoneNumberSchema.index({ verificationStatus: 1 });
businessPhoneNumberSchema.index({ complianceStatus: 1 });

// Set as default phone number for business
businessPhoneNumberSchema.methods.setAsDefault = async function() {
    // First, unset any existing default
    await this.constructor.updateMany(
        { businessId: this.businessId, isDefault: true },
        { isDefault: false }
    );
    
    // Then set this one as default
    this.isDefault = true;
    await this.save();
    return this;
};

// Create model
const BusinessPhoneNumber = mongoose.model('BusinessPhoneNumber', businessPhoneNumberSchema);

module.exports = { SMS, BusinessPhoneNumber }; 