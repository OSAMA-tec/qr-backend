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
  getAllBusinesses,
  updateCustomerDetails
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
      message: `Access denied! Only admins can access this resource 🚫 ${req.user.role}`
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
router.put('/business-profile', businessProfileValidation, updateBusinessProfile); //tt

// Customer management routes 👥
router.get('/customers', listCustomers);
router.get('/customers/:id', getCustomerDetails);
router.patch('/customers/:id', updateCustomerDetails); // 🆕 New route for updating customer details

// Staff management routes 👥
router.get('/staff', listStaff);
router.post('/staff', staffMemberValidation, addStaffMember); //tt
router.delete('/staff/:id', removeStaffMember); //tt

module.exports = router;       