// Import dependencies 📦
const router = require('express').Router();
const {
  register,
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
  resetPasswordValidation
} = require('../middleware/validation.middleware');

const { csrfProtection } = require('../middleware/csrf.middleware');
const authMiddleware = require('../middleware/auth.middleware');

// Public routes 🌐
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password', resetPasswordValidation, resetPassword);
router.get('/verify-email/:token', verifyEmail);

// Protected routes 🔒
router.post('/logout', csrfProtection, authMiddleware, logout);

module.exports = router; 