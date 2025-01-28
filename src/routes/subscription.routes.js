// Import dependencies 📦
const router = require('express').Router();
const {
  getAllPlans,
  getBusinessSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  createPlan,
  getAllSubscriptions
  // handleStripeWebhook
} = require('../controllers/subscription.controller');
const authMiddleware = require('../middleware/auth.middleware');
const express = require('express');

// Middleware to verify admin role 👑
const isAdminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only admin accounts can access subscriptions 🚫'
    });
  }
  next();
};

// Public routes
router.get('/plans', getAllPlans);

// Admin routes
router.use(authMiddleware);
router.use(isAdminMiddleware);

router.get('/all', getAllSubscriptions);
router.post('/plans/create', createPlan);
router.get('/business/:businessId', getBusinessSubscription);
router.post('/create', createSubscription);
router.put('/business/:businessId', updateSubscription);
router.delete('/business/:businessId', cancelSubscription);

// Stripe webhook (needs raw body)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  // handleStripeWebhook
);

// Export router 📤
module.exports = router; 