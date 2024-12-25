// Import dependencies 📦
const router = require('express').Router();
const {
  getPopupConfig,
  updatePopupSettings,
  getPopupTemplates,
  generatePopupPreview
} = require('../controllers/popup.controller');

const {
  popupSettingsValidation,
  popupPreviewValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Custom middleware to check if user is business 🏢
const isBusinessMiddleware = (req, res, next) => {
  if (req.user.role !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only business accounts can access this resource 🚫'
    });
  }
  next();
};

// Public routes 🌐
router.get('/:businessId', getPopupConfig);  // Get popup configuration

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

// Popup management routes
router.put(
  '/:businessId',
  csrfProtection,
  popupSettingsValidation,
  updatePopupSettings
);

router.get('/templates', getPopupTemplates);

router.post(
  '/preview',
  csrfProtection,
  popupPreviewValidation,
  generatePopupPreview
);

module.exports = router; 