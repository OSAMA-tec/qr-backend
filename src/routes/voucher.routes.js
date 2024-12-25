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
  redeemVoucher
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
router.post('/', csrfProtection, voucherCreationValidation, createVoucher);
router.get('/', listVouchers);
router.get('/:id', getVoucherDetails);
router.put('/:id', csrfProtection, voucherUpdateValidation, updateVoucher);
router.delete('/:id', csrfProtection, deleteVoucher);

// Voucher status routes
router.post('/:id/activate', csrfProtection, toggleVoucherStatus);
router.post('/:id/deactivate', csrfProtection, toggleVoucherStatus);

// Voucher validation and redemption
router.post('/validate', csrfProtection, voucherValidationRules, validateVoucher);
router.post('/redeem', csrfProtection, voucherRedemptionValidation, redeemVoucher);

module.exports = router; 