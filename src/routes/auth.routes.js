// Import dependencies 📦
const router = require('express').Router();
const {
  register,
  registerAdmin,
  registerBusiness,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  logout
} = require('../controllers/auth.controller');

const {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  adminRegistrationValidation,
  businessRegistrationValidation
} = require('../middleware/validation.middleware');

const { csrfProtection } = require('../middleware/csrf.middleware');
const authMiddleware = require('../middleware/auth.middleware');

// Custom middleware to check if user is admin 👑
const isAdminMiddleware = (req, res, next) => {
    console.log(req.user)
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only admins can access this resource 🚫'
    });
  }
  next();
};

// CSRF token route 🔑
router.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Public routes 🌐
router.post('/register', registerValidation, register);
router.post('/register-admin', adminRegistrationValidation, registerAdmin);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password', resetPasswordValidation, resetPassword);

// Email verification routes (both GET and POST supported)
router.get('/verify-email/:token', verifyEmail);  // For email link clicks
router.post('/verify-email/:token', verifyEmail); // For API calls

// Protected routes 🔒
router.post('/logout', csrfProtection, authMiddleware, logout);

// Admin-only routes 👑
router.post(
  '/register-business',
  authMiddleware,
  isAdminMiddleware,
  csrfProtection,
  businessRegistrationValidation,
  registerBusiness
);

module.exports = router; 