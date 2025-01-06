// Import dependencies 📦
const router = require('express').Router();
const {
  getVoucherPopup,
  registerAndClaimVoucher,
  getClaimedVoucher,
  toggleVoucherUsage
} = require('../controllers/popup.controller');

const {
  userRegistrationValidation
} = require('../middleware/validation.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// API routes for voucher popup flow 🌐
router.get('/voucher/business/:businessId', getVoucherPopup); // Get active voucher by businessId
router.post('/voucher/business/:businessId/claim', userRegistrationValidation, registerAndClaimVoucher); // Register & claim
router.get('/claimed-voucher/:claimId', getClaimedVoucher); // Get claimed voucher details

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

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);
router.put('/voucher/:voucherId/toggle-usage',csrfProtection, toggleVoucherUsage); // Toggle voucher usage status

module.exports = router; 



