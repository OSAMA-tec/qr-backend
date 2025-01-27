// Import dependencies 📦
const router = require('express').Router();
const {
  getAllCustomers,
  getCustomerDetails
} = require('../controllers/admin.controller');

const authMiddleware = require('../middleware/auth.middleware');
const { getLookupData } = require('../controllers/lookup.controller');

// Admin middleware to check role 👑
const isAdminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only admins can access this resource 🚫'
    });
  }
  next();
};

// Apply auth and admin check to all routes
router.use(authMiddleware);
router.use(isAdminMiddleware);

// Customer management routes 👥
router.get('/customers', getAllCustomers);
router.get('/customers/:id', getCustomerDetails);
router.get('/lookup', getLookupData);

module.exports = router; 