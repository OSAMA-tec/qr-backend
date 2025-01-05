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
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Invalid thumbnail URL! 🚫'
    }
  },
  category: {
    type: String,
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
    branding: {
      logo: {
        url: String,
        width: Number,
        height: Number,
        position: {
          type: String,
          default: 'top'
        }
      },
      businessName: {
        show: {
          type: Boolean,
          default: true
        },
        fontSize: {
          type: Number,
          default: 24
        },
        fontWeight: {
          type: String,
          default: 'bold'
        }
      }
    },
    offer: {
      title: {
        text: {
          type: String,
          default: '15% OFF BILL'
        },
        fontSize: {
          type: Number,
          default: 32
        },
        fontWeight: {
          type: String,
          default: 'bold'
        }
      },
      description: {
        text: {
          type: String,
          default: 'Get reward 15% OFF EVERYTHING! for the first visit!'
        },
        fontSize: {
          type: Number,
          default: 16
        }
      }
    },
    qrCode: {
      size: {
        type: String,
        default: 'medium'
      },
      position: {
        type: String,
        default: 'center'
      },
      style: {
        type: String,
        default: 'standard'
      },
      backgroundColor: {
        type: String,
        default: '#FFFFFF'
      },
      foregroundColor: {
        type: String,
        default: '#000000'
      },
      margin: {
        type: Number,
        default: 20
      },
      errorCorrectionLevel: {
        type: String,
        default: 'M'
      }
    },
    walletIntegration: {
      enabled: {
        type: Boolean,
        default: true
      },
      types: {
        apple: {
          enabled: {
            type: Boolean,
            default: true
          },
          buttonStyle: {
            type: String,
            default: 'black'
          }
        },
        google: {
          enabled: {
            type: Boolean,
            default: true
          },
          buttonStyle: {
            type: String,
            default: 'black'
          }
        }
      },
      position: {
        type: String,
        default: 'bottom'
      }
    },
    design: {
      layout: {
        type: {
          type: String,
          default: 'standard'
        },
        spacing: {
          type: Number,
          default: 20
        },
        padding: {
          type: Number,
          default: 24
        }
      },
      colors: {
        primary: {
          type: String,
          default: '#000000',
          validate: {
            validator: function(v) {
              return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Invalid color format! Use hex code (e.g., #FF5733)'
          }
        },
        secondary: {
          type: String,
          default: '#FFFFFF',
          validate: {
            validator: function(v) {
              return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Invalid color format!'
          }
        },
        background: {
          type: String,
          default: '#FFFFFF',
          validate: {
            validator: function(v) {
              return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Invalid color format!'
          }
        },
        text: {
          type: String,
          default: '#000000',
          validate: {
            validator: function(v) {
              return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Invalid color format!'
          }
        }
      },
      typography: {
        fontFamily: {
          type: String,
          default: 'Inter'
        },
        scale: {
          type: String,
          default: 'medium'
        }
      },
      borderRadius: {
        type: Number,
        default: 8,
        min: 0,
        max: 50
      },
      shadow: {
        enabled: {
          type: Boolean,
          default: true
        },
        intensity: {
          type: String,
          default: 'medium'
        }
      }
    },
    pwa: {
      enabled: {
        type: Boolean,
        default: true
      },
      icon: String,
      backgroundColor: {
        type: String,
        default: '#FFFFFF'
      },
      themeColor: {
        type: String,
        default: '#000000'
      }
    },
    display: {
      position: {
        type: String,
        default: 'bottom-right'
      },
      animation: {
        type: String,
        default: 'fade'
      },
      timing: {
        delay: {
          type: Number,
          default: 0,
          min: 0,
          max: 60000
        },
        duration: {
          type: Number,
          default: 5000,
          min: 1000,
          max: 300000
        }
      },
      responsive: {
        mobile: {
          enabled: {
            type: Boolean,
            default: true
          },
          breakpoint: {
            type: Number,
            default: 768
          }
        },
        desktop: {
          enabled: {
            type: Boolean,
            default: true
          }
        }
      }
    },
    support: {
      contactNumber: String,
      helpText: String
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
  
  // Ensure all nested objects exist
  this.settings.branding = this.settings.branding || {};
  this.settings.offer = this.settings.offer || {};
  this.settings.qrCode = this.settings.qrCode || {};
  this.settings.walletIntegration = this.settings.walletIntegration || {};
  this.settings.design = this.settings.design || {};
  this.settings.pwa = this.settings.pwa || {};
  this.settings.display = this.settings.display || {};
  this.settings.support = this.settings.support || {};
  
  next();
});

// Create model 🏗️
const WidgetTemplate = mongoose.model('WidgetTemplate', widgetTemplateSchema);

module.exports = WidgetTemplate; 