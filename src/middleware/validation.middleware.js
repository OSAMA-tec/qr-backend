// Import dependencies 📦
const { body, validationResult } = require('express-validator');

// Validation error handler 🚫
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed! ❌',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Register validation rules ✅
const registerValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long 🔑')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])/)
    .withMessage('Password must contain at least one number, one lowercase and one uppercase letter 🔒'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required 👤')
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters long'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required 👤')
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters long'),
  body('role')
    .optional()
    .isIn(['customer', 'business'])
    .withMessage('Invalid role selected 🎭'),
  handleValidationErrors
];

// Login validation rules 🔐
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required 🔑'),
  handleValidationErrors
];

// Password reset validation rules 🔄
const forgotPasswordValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  handleValidationErrors
];

// Reset password validation rules 🔏
const resetPasswordValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required 🎟️'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long 🔑')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])/)
    .withMessage('Password must contain at least one number, one lowercase and one uppercase letter 🔒'),
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation
}; 