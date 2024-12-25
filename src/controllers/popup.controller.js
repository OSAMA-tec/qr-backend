// Import dependencies 📦
const User = require('../models/user.model');

// Get popup configuration 🎯
const getPopupConfig = async (req, res) => {
  try {
    const { businessId } = req.params;

    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business',
      isVerified: true 
    }).select('businessProfile.popupSettings');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or not verified! 🏢'
      });
    }

    res.json({
      success: true,
      data: {
        settings: business.businessProfile.popupSettings || {
          template: 'default',
          timing: {
            displayDelay: 3000,
            displayFrequency: 'once-per-session',
            scrollTrigger: 50
          },
          design: {
            layout: 'centered',
            colors: {
              background: '#FFFFFF',
              text: '#000000',
              button: '#4CAF50'
            },
            logo: business.businessProfile.logo
          },
          content: {
            title: 'Special Offer!',
            description: 'Get your exclusive discount',
            buttonText: 'Claim Now'
          }
        }
      }
    });
  } catch (error) {
    console.error('Get popup config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popup configuration! 😢'
    });
  }
};

// Update popup settings 🎨
const updatePopupSettings = async (req, res) => {
  try {
    const { businessId } = req.params;
    const settings = req.body;

    const business = await User.findOneAndUpdate(
      { 
        _id: businessId, 
        role: 'business',
        isVerified: true 
      },
      {
        $set: {
          'businessProfile.popupSettings': {
            ...settings,
            updatedAt: new Date()
          }
        }
      },
      { new: true }
    ).select('businessProfile.popupSettings');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or not verified! 🏢'
      });
    }

    res.json({
      success: true,
      message: 'Popup settings updated successfully! 🎨',
      data: business.businessProfile.popupSettings
    });
  } catch (error) {
    console.error('Update popup settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update popup settings! 😢'
    });
  }
};

// Get popup templates 📝
const getPopupTemplates = async (req, res) => {
  try {
    // Predefined templates
    const templates = [
      {
        id: 'default',
        name: 'Default Template',
        description: 'Simple and clean design',
        preview: 'https://example.com/templates/default.png',
        settings: {
          layout: 'centered',
          colors: {
            background: '#FFFFFF',
            text: '#000000',
            button: '#4CAF50'
          }
        }
      },
      {
        id: 'modern',
        name: 'Modern Template',
        description: 'Sleek and modern design',
        preview: 'https://example.com/templates/modern.png',
        settings: {
          layout: 'right-aligned',
          colors: {
            background: '#2C3E50',
            text: '#FFFFFF',
            button: '#E74C3C'
          }
        }
      },
      {
        id: 'festive',
        name: 'Festive Template',
        description: 'Perfect for special occasions',
        preview: 'https://example.com/templates/festive.png',
        settings: {
          layout: 'full-width',
          colors: {
            background: '#FFD700',
            text: '#8B4513',
            button: '#FF4500'
          }
        }
      }
    ];

    res.json({
      success: true,
      data: {
        templates,
        categories: ['Simple', 'Modern', 'Festive', 'Seasonal'],
        features: ['Customizable Colors', 'Mobile Responsive', 'Animation Effects']
      }
    });
  } catch (error) {
    console.error('Get popup templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popup templates! 😢'
    });
  }
};

// Generate popup preview 👁️
const generatePopupPreview = async (req, res) => {
  try {
    const {
      template,
      settings,
      content
    } = req.body;

    // Validate template
    const validTemplates = ['default', 'modern', 'festive'];
    if (!validTemplates.includes(template)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template selected! 🚫'
      });
    }

    // Generate preview HTML
    const previewHtml = generatePreviewHtml(template, settings, content);

    res.json({
      success: true,
      data: {
        previewHtml,
        previewUrl: `data:text/html;base64,${Buffer.from(previewHtml).toString('base64')}`,
        settings: {
          template,
          ...settings
        }
      }
    });
  } catch (error) {
    console.error('Generate popup preview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate popup preview! 😢'
    });
  }
};

// Helper function to generate preview HTML 🛠️
const generatePreviewHtml = (template, settings, content) => {
  // Basic template structure
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        .popup-container {
          font-family: Arial, sans-serif;
          background-color: ${settings.colors?.background || '#FFFFFF'};
          color: ${settings.colors?.text || '#000000'};
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 400px;
          margin: 20px auto;
          text-align: center;
        }
        .popup-button {
          background-color: ${settings.colors?.button || '#4CAF50'};
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 15px;
        }
        .popup-logo {
          max-width: 150px;
          margin-bottom: 15px;
        }
      </style>
    </head>
    <body>
      <div class="popup-container">
        ${settings.logo ? `<img src="${settings.logo}" class="popup-logo" alt="Logo">` : ''}
        <h2>${content.title || 'Special Offer!'}</h2>
        <p>${content.description || 'Get your exclusive discount'}</p>
        <button class="popup-button">${content.buttonText || 'Claim Now'}</button>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  getPopupConfig,
  updatePopupSettings,
  getPopupTemplates,
  generatePopupPreview
}; 