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
  updateCustomerDetails,
  getDashboardStats,
  getTopCustomers,
  getInfluencersList,
  getBusinessById,
  updateTermsAndConditions,
  getTermsAndConditions,
  getAllCustomers,
  clearBusinessData
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
router.post('/business-details', getBusinessById);
router.get('/terms-conditions/:businessId', getTermsAndConditions);
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
router.put('/business-profile', businessProfileValidation, updateBusinessProfile);

// Terms and Conditions routes 📄
router.put('/terms-conditions', updateTermsAndConditions);
router.get('/terms-conditions', getTermsAndConditions);

// Customer management routes 👥
router.get('/customers', listCustomers);
router.get('/customers/all', getAllCustomers);  // Add new route for advanced filtering
router.get('/customers/top', getTopCustomers);  // Add top customers route 🏆
router.get('/influencers', getInfluencersList); // 🆕 Add influencers list route
router.get('/customers/:id', getCustomerDetails);
router.patch('/customers/:id', updateCustomerDetails); // 🆕 New route for updating customer details
router.get('/dashboard', getDashboardStats);  // Add dashboard stats route 📊

// Staff management routes 👥
router.get('/staff', listStaff);
router.post('/staff', staffMemberValidation, addStaffMember); //tt
router.delete('/staff/:id', removeStaffMember); //tt

// Clear business data route 🧹
router.delete('/clear-data', clearBusinessData);

module.exports = router;       