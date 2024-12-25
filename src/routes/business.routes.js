// Import dependencies 📦
const router = require('express').Router();
const {
  getBusinessProfile,
  updateBusinessProfile,
  listCustomers,
  getCustomerDetails,
  listStaff,
  addStaffMember,
  removeStaffMember
} = require('../controllers/business.controller');

const {
  businessProfileValidation,
  staffMemberValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Custom middleware to check if user is a business 🏢
const isBusinessMiddleware = (req, res, next) => {
  if (req.user.role !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only business accounts can access this resource 🚫'
    });
  }
  next();
};

// Apply auth and business middleware to all routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

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