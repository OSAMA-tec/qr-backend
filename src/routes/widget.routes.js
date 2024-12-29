// Import dependencies 📦
const router = require('express').Router();
const {
  getWidgetConfig,
  claimVoucher,
  getCustomizationOptions,
  updateWidgetAppearance,
  getEmbedCode,
  manageBusinessWidget,
  getAllBusinessWidgets,
  getBusinessWidgetDetails,
  linkVouchersToWidget,
  getBusinessOwnWidget
} = require('../controllers/widget.controller');

const {
  widgetCustomizationValidation,
  voucherClaimValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');
const { upload } = require('../utils/upload.utils');

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

// Custom middleware to check if user is admin 👑
const isAdminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only admins can access this resource 🚫'
    });
  }
  next();
};

// Public widget routes 🌐
router.get('/:businessId/config', getWidgetConfig);  // Get widget configuration
router.post('/claim-voucher', csrfProtection, voucherClaimValidation, claimVoucher);  // Claim voucher as guest

// Admin routes for managing business widgets 👑
router.get('/admin/businesses', authMiddleware, isAdminMiddleware, getAllBusinessWidgets);  // List all business widgets
router.get('/admin/businesses/:businessId', authMiddleware, isAdminMiddleware, getBusinessWidgetDetails);  // Get specific widget details
router.put(
  '/admin/businesses/:businessId',
  authMiddleware,
  isAdminMiddleware,
  csrfProtection,
  upload.single('logo'),
  widgetCustomizationValidation,
  manageBusinessWidget
);  // Update business widget

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

// Widget management routes
router.get('/my-widget', getBusinessOwnWidget);  // 🆕 Get business's own widget with vouchers
router.get('/customize', getCustomizationOptions);
router.put('/customize', csrfProtection, widgetCustomizationValidation, updateWidgetAppearance);
router.get('/embed-code', getEmbedCode);

// Voucher linking route 🔗
router.put('/vouchers', csrfProtection, linkVouchersToWidget);

module.exports = router; 