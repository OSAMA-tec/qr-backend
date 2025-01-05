// Import dependencies 📦
const router = require('express').Router();
const {
  getVoucherPopup,
  getVoucherForm,
  registerAndClaimVoucher,
  getClaimedVoucher
} = require('../controllers/popup.controller');

const {
  userRegistrationValidation
} = require('../middleware/validation.middleware');

// Public routes for voucher popup flow 🌐
router.get('/voucher/:voucherId', getVoucherPopup); // Show voucher details
router.get('/voucher/:voucherId/form', getVoucherForm); // Show registration form
router.post('/voucher/:voucherId/claim', userRegistrationValidation, registerAndClaimVoucher); // Register & claim
router.get('/claimed-voucher/:claimId', getClaimedVoucher); // Get claimed voucher details

module.exports = router; 