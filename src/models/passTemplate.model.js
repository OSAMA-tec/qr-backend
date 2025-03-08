// src/models/passTemplate.model.js
const mongoose = require('mongoose');

const passTemplateSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  templateName: {
    type: String,
    required: true,
    trim: true
  },
  walletConfig: {
    type: {
      type: String,
      enum: ['apple', 'android'],
      required: true
    },
    version: String,
    notificationSettings: {
      title: String,
      enabled: Boolean
    }
  },
  design: {
    colors: {
      primary: String,
      secondary: String,
      background: String,
      text: String
    },
    qrCode: {
      style: {
        type: String,
        enum: ['default', 'rounded', 'circular', 'bordered']
      },
      value: String,
      foregroundColor: String,
      backgroundColor: String
    }
  },
  branding: {
    logoText: String,
    assets: {
      logo: {
        url: String,
        size: {
          width: Number,
          height: Number
        },
        format: String,
        originalFileName: String
      },
      icon: {
        url: String,
        size: {
          width: Number,
          height: Number
        },
        format: String,
        originalFileName: String
      },
      strip: {
        url: String,
        size: {
          width: Number,
          height: Number
        },
        format: String,
        originalFileName: String
      }
    }
  },
  content: {
    primaryField: {
      id: String,
      title: String,
      value: String,
      type: String,
      style: {
        fontSize: String,
        fontWeight: String,
        alignment: String
      }
    },
    stripContent: {
      title: String,
      description: String
    },
    auxiliaryFields: [{
      id: String,
      title: String,
      value: String,
      type: String,
      position: String
    }],
    extraFields: [{
      id: String,
      title: String,
      value: String,
      type: String,
      position: String
    }]
  },
  metadata: {
    organizationId: String,
    campaignId: String,
    tags: [String],
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'active'
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    localization: {
      defaultLanguage: String,
      supportedLanguages: [String]
    }
  },
  distribution: {
    validityPeriod: {
      start: Date,
      end: Date
    },
    maxInstances: Number,
    restrictions: {
      redeemable: Boolean,
      transferable: Boolean,
      requiresAuthentication: Boolean
    }
  },
  settings: {
    passUpdatable: Boolean,
    automaticUpdates: Boolean,
    expiryNotification: Boolean,
    barcodeFormat: String,
    relevantLocations: [{
      latitude: Number,
      longitude: Number,
      radius: Number,
      name: String
    }]
  }
}, {
  timestamps: true
});

// Indexes
passTemplateSchema.index({ businessId: 1, templateName: 1 });
passTemplateSchema.index({ 'metadata.status': 1 });
passTemplateSchema.index({ 'metadata.tags': 1 });

const PassTemplate = mongoose.model('PassTemplate', passTemplateSchema);
module.exports = PassTemplate;