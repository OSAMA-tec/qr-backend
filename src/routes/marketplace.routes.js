// Marketplace routes for customers 🛒
const router = require('express').Router();
const {
  getMarketplaceVouchers,
  claimMarketplaceVoucher
} = require('../controllers/marketplace.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public marketplace routes
router.get('/', getMarketplaceVouchers);

// Public customer routes 🔒
router.post('/:voucherId/claim', 
  claimMarketplaceVoucher
);
router.use(authMiddleware);

module.exports = router; 