// Import dependencies 📦
const router = require('express').Router();
const {
  getWidgetConfig,
  claimVoucher,
  getCustomizationOptions,
  updateWidgetAppearance,
  getEmbedCode
} = require('../controllers/widget.controller');

const {
  widgetCustomizationValidation,
  voucherClaimValidation
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

// Widget configuration routes 🔧
router.get('/:businessId/config', getWidgetConfig);  // Public route

// Voucher claim route 🎟️
router.post(
  '/claim-voucher',
  csrfProtection,
  voucherClaimValidation,
  claimVoucher
);

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

// Customization routes 🎨
router.get('/customize', getCustomizationOptions);
router.put(
  '/customize',
  csrfProtection,
  widgetCustomizationValidation,
  updateWidgetAppearance
);

// Embed code route 📝
router.get('/embed-code', getEmbedCode);

module.exports = router; 