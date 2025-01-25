// Import dependencies 📦
const router = require('express').Router();
const {
  createVoucher,
  listVouchers,
  getVoucherDetails,
  updateVoucher,
  deleteVoucher,
  toggleVoucherStatus,
  validateVoucher,
  redeemVoucher,
  getClaimedVoucherUsers,
  scanVoucher
} = require('../controllers/voucher.controller');

const {
  voucherCreationValidation,
  voucherUpdateValidation,
  voucherValidationRules,
  voucherRedemptionValidation
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

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

// Voucher management routes
router.post('/', voucherCreationValidation, createVoucher); //tt
router.get('/', listVouchers);

// Get claimed voucher users 👥
router.get('/claimed-users', getClaimedVoucherUsers);

// Voucher validation and redemption
router.post('/validate', voucherValidationRules, validateVoucher); //tt
router.post('/redeem', voucherRedemptionValidation, redeemVoucher); //tt
// QR code scanning endpoint
router.post('/scan', scanVoucher); //tt
// ID specific routes
router.get('/:id', getVoucherDetails); //tt
router.put('/:id', voucherUpdateValidation, updateVoucher); //tt
router.delete('/:id', deleteVoucher); //tt
router.post('/:id/activate', toggleVoucherStatus); //tt
router.post('/:id/deactivate', toggleVoucherStatus); //tt

module.exports = router; 