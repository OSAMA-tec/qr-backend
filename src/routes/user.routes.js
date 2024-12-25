// Import dependencies 📦
const router = require('express').Router();
const {
  getProfile,
  updateProfile,
  updateGdprConsent,
  getVouchers,
  getVoucherDetails,
  getWalletPasses
} = require('../controllers/user.controller');

const {
  profileUpdateValidation,
  gdprConsentValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Apply auth middleware to all routes 🔒
router.use(authMiddleware);

// Profile routes 👤
router.get('/profile', getProfile);
router.put('/profile', csrfProtection, profileUpdateValidation, updateProfile);

// GDPR routes 📜
router.put('/gdpr-consent', csrfProtection, gdprConsentValidation, updateGdprConsent);

// Voucher routes 🎟️
router.get('/vouchers', getVouchers);
router.get('/vouchers/:id', getVoucherDetails);

// Digital wallet routes 📱
router.get('/wallet', getWalletPasses);

module.exports = router;