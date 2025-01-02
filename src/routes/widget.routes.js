// Import dependencies 📦
const router = require('express').Router();
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
  getActiveTemplates
} = require('../controllers/widget.controller');

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

// Public routes 🌐
router.get('/:businessId/config', getWidgetConfig);
router.post('/claim-voucher', csrfProtection, claimVoucher);

// Business routes 💼
router.use('/business', authMiddleware, isBusiness);
router.get('/business/customize', getCustomizationOptions);
router.put('/business/customize', csrfProtection, updateWidgetAppearance);
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
  upload.single('thumbnail'), // Add multer middleware for thumbnail
  createTemplate
);

router.get('/admin/templates', getAllTemplates);
router.get('/admin/templates/:id', getTemplateById);

router.put('/admin/templates/:id', 
  csrfProtection,
  upload.single('thumbnail'), // Add multer middleware for thumbnail updates
  updateTemplate
);

router.delete('/admin/templates/:id', csrfProtection, deleteTemplate);

module.exports = router; 