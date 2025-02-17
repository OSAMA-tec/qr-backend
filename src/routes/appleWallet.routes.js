// Import dependencies 📦
const router = require('express').Router();
const {
  generateBusinessPass,
  generateVoucherPass,
  getVoucherDetails,
  getPassQRCode
} = require('../controllers/appleWallet.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all routes
// router.use(authMiddleware);

// Business pass routes 🎫
router.get('/business/:businessId/pass', generateBusinessPass);
router.get('/business/pass', generateBusinessPass); // For current business

// Voucher pass routes 🎟️
router.post('/business/:businessId/voucher/:voucherId/pass/:userId', generateVoucherPass);
router.get('/business/:businessId/voucher/:voucherId/details', getVoucherDetails);
router.get('/business/:businessId/voucher/:voucherId/qr', getPassQRCode);

module.exports = router; 