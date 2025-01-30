// Marketplace routes for customers 🛒
const router = require('express').Router();
const {
  getMarketplaceVouchers,
  claimMarketplaceVoucher
} = require('../controllers/marketplace.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public marketplace routes
router.get('/', getMarketplaceVouchers);

// Protected customer routes 🔒
router.use(authMiddleware);
router.post('/:voucherId/claim', claimMarketplaceVoucher);

module.exports = router; 