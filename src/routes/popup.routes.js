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

// Public routes for voucher popup flow 🌐
router.get('/voucher/:voucherId', getVoucherPopup); // Get initial voucher popup
router.post('/claim-voucher', userRegistrationValidation, registerAndClaimVoucher); // Register & claim
router.get('/claimed-voucher/:claimId', getClaimedVoucher); // Get claimed voucher details

module.exports = router; 