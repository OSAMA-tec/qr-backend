// Import dependencies 📦
const router = require('express').Router();
const {
  getBusinessProfile,
  updateBusinessProfile,
  listCustomers,
  getCustomerDetails,
  listStaff,
  addStaffMember,
  removeStaffMember,
  getAllBusinesses
} = require('../controllers/business.controller');

const {
  businessProfileValidation,
  staffMemberValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Admin middleware 👑
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only admins can access this resource 🚫'
    });
  }
  next();
};

// Apply auth middleware to all routes 🔒
router.use(authMiddleware);

// Admin routes 👑
router.get(
  '/all',
  isAdmin,
  csrfProtection,
  getAllBusinesses
);

// Business profile routes 🏢
router.get('/business-profile', getBusinessProfile);
router.put('/business-profile', csrfProtection, businessProfileValidation, updateBusinessProfile);

// Customer management routes 👥
router.get('/customers', listCustomers);
router.get('/customers/:id', getCustomerDetails);

// Staff management routes 👥
router.get('/staff', listStaff);
router.post('/staff', csrfProtection, staffMemberValidation, addStaffMember);
router.delete('/staff/:id', csrfProtection, removeStaffMember);

module.exports = router; 