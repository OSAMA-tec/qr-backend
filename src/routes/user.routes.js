// Import dependencies 📦
const router = require('express').Router();
const {
  getProfile,
  updateProfile,
  updateGdprConsent,
  getVouchers,
  getVoucherDetails,
  getWalletPasses,
  uploadProfilePic,
  deleteProfilePic
} = require('../controllers/user.controller');

const {
  profileUpdateValidation,
  gdprConsentValidation
} = require('../middleware/validation.middleware');

const { upload } = require('../utils/upload.utils');
const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Apply auth middleware to all routes 🔒
router.use(authMiddleware);

// Profile routes 👤
router.get('/profile', getProfile);
router.put('/profile', profileUpdateValidation, updateProfile);

// Profile picture routes 🖼️
router.post(
  '/profile/picture',
  csrfProtection,
  upload.single('profilePic'), // 'profilePic' is the field name in form-data
  uploadProfilePic
);
router.delete('/profile/picture', csrfProtection, deleteProfilePic);

// GDPR routes 📜
router.put('/gdpr-consent', gdprConsentValidation, updateGdprConsent);

// Voucher routes 🎫
router.get('/vouchers', getVouchers);
router.get('/vouchers/:id', getVoucherDetails);

// Wallet routes 👛
router.get('/wallet', getWalletPasses);

module.exports = router;