// Import dependencies 📦
const express = require('express');
const multer = require('multer');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');
const { upload } = require('../utils/upload.utils');
const {
  getWidgetConfig,
  claimVoucher,
  getCustomizationOptions,
  updateWidgetAppearance,
  getEmbedCode,
  getAllBusinessWidgets,
  getBusinessWidgetDetails,
  getBusinessOwnWidget,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAllTemplates,
  getTemplateById,
  getActiveTemplates,
  uploadWidgetThumbnail
} = require('../controllers/widget.controller');

// Validation middleware 🔍
const validateWidgetTemplate = (req, res, next) => {
  console.log('Request body:', req.body); // Debug log

  // Parse settings if it's a string
  if (typeof req.body.settings === 'string') {
    try {
      req.body.settings = JSON.parse(req.body.settings);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings JSON format! ⚙️'
      });
    }
  }

  const { name, description, category, settings } = req.body;

  // Basic validation
  if (!name || name.length < 3 || name.length > 50) {
    return res.status(400).json({
      success: false,
      message: 'Name must be between 3 and 50 characters! 📏'
    });
  }

  if (!description || description.length < 10 || description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Description must be between 10 and 500 characters! 📝'
    });
  }

  if (!category || !['popup', 'banner', 'sidebar', 'floating'].includes(category)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid category! Must be one of: popup, banner, sidebar, floating 📑'
    });
  }

  // Settings validation
  if (settings) {
    try {
      // Validate colors if provided
      if (settings.design?.colors) {
        const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        const colors = settings.design.colors;
        
        for (const [key, value] of Object.entries(colors)) {
          if (value && !colorRegex.test(value)) {
            return res.status(400).json({
              success: false,
              message: `Invalid ${key} color format! Use hex code (e.g., #FF5733) 🎨`
            });
          }
        }
      }

      // Validate numeric values
      if (settings.design?.borderRadius && (settings.design.borderRadius < 0 || settings.design.borderRadius > 50)) {
        return res.status(400).json({
          success: false,
          message: 'Border radius must be between 0 and 50! 🔄'
        });
      }

      // Validate timing values
      if (settings.display?.timing) {
        const { delay, duration } = settings.display.timing;
        if (delay < 0 || delay > 60000) {
          return res.status(400).json({
            success: false,
            message: 'Delay must be between 0 and 60000ms! ⏱️'
          });
        }
        if (duration < 1000 || duration > 300000) {
          return res.status(400).json({
            success: false,
            message: 'Duration must be between 1000 and 300000ms! ⏳'
          });
        }
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings format! Please check your input. ⚙️'
      });
    }
  }

  next();
};

// Middleware to check roles 🔒
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Admin only resource 🚫'
    });
  }
  next();
};

const isBusiness = (req, res, next) => {
  if (req.user.role !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Business only resource 🚫'
    });
  }
  next();
};

// Configure multer for file uploads 📁
const storage = multer.memoryStorage();
// const upload = multer({ 
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   }
// });

// Handle multipart data middleware 📦
const handleMultipartData = (req, res, next) => {
  console.log('Handling multipart data...'); // Debug log
  
  // Parse settings if it's a string
  if (req.body.settings && typeof req.body.settings === 'string') {
    try {
      req.body.settings = JSON.parse(req.body.settings);
    } catch (error) {
      console.error('Failed to parse settings:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid settings format! Please check your input. ❌'
      });
    }
  }
  
  next();
};

// Thumbnail upload routes 🖼️
router.post('/admin/templates/thumbnail', 
  authMiddleware,
  isAdmin,
  csrfProtection,
  upload.single('thumbnail'),
  handleMultipartData,
  uploadWidgetThumbnail
);

router.post('/admin/templates/:templateId/thumbnail', 
  authMiddleware,
  isAdmin,
  csrfProtection,
  upload.single('thumbnail'),
  handleMultipartData,
  uploadWidgetThumbnail
);

// Public routes 🌐
router.get('/:businessId/config', getWidgetConfig);
router.post('/claim-voucher', csrfProtection, claimVoucher);

// Business routes 💼
router.use('/business', authMiddleware, isBusiness);
router.get('/business/customize', getCustomizationOptions);
router.put('/business/customize', csrfProtection, validateWidgetTemplate, updateWidgetAppearance);
router.get('/business/embed-code', getEmbedCode);
router.get('/business/widget', getBusinessOwnWidget);

// Template routes for business 🎨
router.get('/business/templates', getActiveTemplates);
router.get('/business/templates/:id', getTemplateById);

// Admin routes 👑
router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/businesses', getAllBusinessWidgets);
router.get('/admin/businesses/:businessId', getBusinessWidgetDetails);

// Template management routes for admin 🎨
router.post('/admin/templates', 
  csrfProtection,
  authMiddleware,
  isAdmin,
  upload.single('thumbnail'),
  handleMultipartData,
  validateWidgetTemplate,
  createTemplate
);

router.get('/admin/templates', getAllTemplates);
router.get('/admin/templates/:id', getTemplateById);

router.put('/admin/templates/:id', 
  csrfProtection,
  authMiddleware,
  isAdmin,
  validateWidgetTemplate,
  updateTemplate
);

router.delete('/admin/templates/:id', csrfProtection, deleteTemplate);

module.exports = router; 