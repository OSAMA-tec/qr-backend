// Import dependencies 📦
const router = require('express').Router();
const {
  getAllBusinesses,
  getBusinessDetails,
  getBusinessAnalytics,
  getAdminDashboardStats,
  getAllCampaigns,
  getSubscriptionStats
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

// Dashboard Overview 📊
router.get('/dashboard/stats', getAdminDashboardStats);

// Business management routes 🏢
router.get('/businesses', getAllBusinesses);
router.get('/businesses/:id', getBusinessDetails);
router.get('/businesses/:id/analytics', getBusinessAnalytics);

// Campaign management routes 🎯
router.get('/campaigns', getAllCampaigns);

// Subscription Stats 💳
router.get('/subscriptions/stats', getSubscriptionStats);

// Lookup routes 📚
router.get('/lookup', getLookupData);

module.exports = router; 