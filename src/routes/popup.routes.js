// Import dependencies 📦
const router = require('express').Router();
const {
  getVoucherPopup,
  registerAndClaimVoucher,
  getClaimedVoucher
} = require('../controllers/popup.controller');

const {
  userRegistrationValidation
} = require('../middleware/validation.middleware');

// API routes for voucher popup flow 🌐
router.get('/api/voucher/:voucherId', getVoucherPopup); // Get voucher details
router.post('/api/voucher/:voucherId/claim', userRegistrationValidation, registerAndClaimVoucher); // Register & claim
router.get('/api/claimed-voucher/:claimId', getClaimedVoucher); // Get claimed voucher details

module.exports = router; 



