// Import dependencies 📦
const mongoose = require('mongoose');

// Widget Template Schema 🎨
const widgetTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Template name is required! 📝'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Template description is required! 📄'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  thumbnail: {
    type: String,
    required: [true, 'Template thumbnail is required! 🖼️'],
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid thumbnail URL! 🚫'
    }
  },
  category: {
    type: String,
    enum: {
      values: ['popup', 'banner', 'sidebar', 'floating'],
      message: 'Invalid category! Must be one of: popup, banner, sidebar, floating'
    },
    default: 'popup'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator reference is required! 👤']
  },
  settings: {
    layout: {
      type: {
        type: String,
        enum: ['split', 'centered', 'minimal', 'full-width'],
        default: 'centered'
      },
      position: {
        type: String,
        enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
        default: 'bottom-right'
      }
    },
    timing: {
      type: {
        type: String,
        enum: ['immediate', 'delay', 'scroll', 'exit-intent'],
        default: 'immediate'
      },
      delay: {
        type: Number,
        min: [0, 'Delay cannot be negative'],
        max: [60000, 'Delay cannot exceed 60 seconds'],
        default: 0
      },
      scrollPercentage: {
        type: Number,
        min: [0, 'Scroll percentage cannot be negative'],
        max: [100, 'Scroll percentage cannot exceed 100'],
        default: 50
      }
    },
    animation: {
      type: String,
      enum: ['fade', 'slide', 'bounce', 'none'],
      default: 'fade'
    },
    design: {
      colors: {
        primary: {
          type: String,
          match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format! Use hex code (e.g., #FF5733)'],
          default: '#4CAF50'
        },
        secondary: {
          type: String,
          match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format!'],
          default: '#2196F3'
        },
        text: {
          type: String,
          match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format!'],
          default: '#000000'
        },
        background: {
          type: String,
          match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format!'],
          default: '#FFFFFF'
        },
        accent: {
          type: String,
          match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format!'],
          default: '#FFC107'
        }
      },
      typography: {
        headingFont: {
          type: String,
          enum: ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'],
          default: 'Arial'
        },
        bodyFont: {
          type: String,
          enum: ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'],
          default: 'Arial'
        },
        fontSize: {
          type: String,
          enum: ['small', 'medium', 'large'],
          default: 'medium'
        }
      },
      borderRadius: {
        type: String,
        enum: ['none', 'small', 'medium', 'large', 'full'],
        default: 'medium'
      },
      shadow: {
        type: String,
        enum: ['none', 'small', 'medium', 'large'],
        default: 'medium'
      }
    },
    qrCode: {
      position: {
        type: String,
        enum: ['left', 'right', 'center'],
        default: 'right'
      },
      size: {
        type: String,
        enum: ['small', 'medium', 'large'],
        default: 'medium'
      },
      style: {
        type: String,
        enum: ['standard', 'rounded', 'dots'],
        default: 'standard'
      },
      margin: {
        type: Number,
        min: [0, 'Margin cannot be negative'],
        max: [100, 'Margin cannot exceed 100px'],
        default: 20
      }
    },
    content: {
      heading: {
        type: String,
        default: 'Welcome!',
        maxlength: [100, 'Heading cannot exceed 100 characters']
      },
      subheading: {
        type: String,
        maxlength: [200, 'Subheading cannot exceed 200 characters']
      },
      body: {
        type: String,
        maxlength: [1000, 'Body text cannot exceed 1000 characters']
      },
      ctaText: {
        type: String,
        default: 'Scan QR Code',
        maxlength: [50, 'CTA text cannot exceed 50 characters']
      },
      showLogo: {
        type: Boolean,
        default: true
      },
      logoPosition: {
        type: String,
        enum: ['top', 'bottom'],
        default: 'top'
      }
    }
  }
}, {
  timestamps: true
});

// Indexes for faster queries 🔍
widgetTemplateSchema.index({ name: 1 });
widgetTemplateSchema.index({ category: 1 });
widgetTemplateSchema.index({ isActive: 1 });
widgetTemplateSchema.index({ createdBy: 1 });
widgetTemplateSchema.index({ 'settings.layout.type': 1 });
widgetTemplateSchema.index({ createdAt: -1 });

// Methods 🛠️
widgetTemplateSchema.methods.toJSON = function() {
  const template = this.toObject();
  delete template.__v;
  return template;
};

// Pre-save middleware to ensure settings structure 🔄
widgetTemplateSchema.pre('save', function(next) {
  // Ensure settings object exists
  this.settings = this.settings || {};
  
  // Ensure nested objects exist
  this.settings.layout = this.settings.layout || {};
  this.settings.timing = this.settings.timing || {};
  this.settings.design = this.settings.design || {};
  this.settings.design.colors = this.settings.design.colors || {};
  this.settings.design.typography = this.settings.design.typography || {};
  this.settings.qrCode = this.settings.qrCode || {};
  this.settings.content = this.settings.content || {};
  
  next();
});

// Create model 🏗️
const WidgetTemplate = mongoose.model('WidgetTemplate', widgetTemplateSchema);

module.exports = WidgetTemplate; 