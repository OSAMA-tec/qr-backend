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

// Admin registration validation rules 👑
const adminRegistrationValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long 🔑')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
    .withMessage('Password must contain at least one number, lowercase, uppercase, and special character 🔒'),
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
  body('adminCode')
    .notEmpty()
    .withMessage('Admin registration code is required 🔐')
    .isLength({ min: 8 })
    .withMessage('Invalid admin registration code format'),
  body('phoneNumber')
    .optional()
    .matches(/^\+?[\d\s-]+$/)
    .withMessage('Invalid phone number format 📱'),
  handleValidationErrors
];

// User profile update validation rules 👤
const profileUpdateValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters long'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters long'),
  body('phoneNumber')
    .optional()
    .matches(/^\+?[\d\s-]+$/)
    .withMessage('Invalid phone number format 📱'),
  body('address')
    .optional()
    .isObject()
    .withMessage('Address must be an object 🏠'),
  body('address.street')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Street address cannot be empty'),
  body('address.city')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('City cannot be empty'),
  body('address.state')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('State cannot be empty'),
  body('address.postalCode')
    .optional()
    .trim()
    .matches(/^[A-Z\d]{3,10}$/i)
    .withMessage('Invalid postal code format'),
  body('address.country')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Country cannot be empty'),
  handleValidationErrors
];

// GDPR consent validation rules 📜
const gdprConsentValidation = [
  body('marketing')
    .isBoolean()
    .withMessage('Marketing consent must be true or false'),
  body('analytics')
    .isBoolean()
    .withMessage('Analytics consent must be true or false'),
  handleValidationErrors
];

// Business profile update validation rules 🏢
const businessProfileValidation = [
  body('businessName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Business category is required'),
  body('logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('socialMedia')
    .optional()
    .isObject()
    .withMessage('Social media must be an object'),
  body('socialMedia.*.url')
    .optional()
    .isURL()
    .withMessage('Social media URL must be valid'),
  body('businessHours')
    .optional()
    .isArray()
    .withMessage('Business hours must be an array'),
  body('businessHours.*.day')
    .optional()
    .isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    .withMessage('Invalid day of week'),
  body('businessHours.*.open')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid opening time format (HH:MM)'),
  body('businessHours.*.close')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Invalid closing time format (HH:MM)'),
  handleValidationErrors
];

// Staff member validation rules 👥
const staffMemberValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
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
    .isIn(['manager', 'staff'])
    .withMessage('Invalid staff role'),
  body('permissions')
    .isArray()
    .withMessage('Permissions must be an array')
    .custom((value) => {
      const validPermissions = ['manage_vouchers', 'view_analytics', 'manage_staff'];
      return value.every(permission => validPermissions.includes(permission));
    })
    .withMessage('Invalid permissions specified'),
  handleValidationErrors
];

// Business registration validation rules 🏢
const businessRegistrationValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long 🔑')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
    .withMessage('Password must contain at least one number, lowercase, uppercase, and special character 🔒'),
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
  body('businessName')
    .trim()
    .notEmpty()
    .withMessage('Business name is required 🏢')
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('businessDescription')
    .trim()
    .notEmpty()
    .withMessage('Business description is required 📝')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Business description must be between 10 and 1000 characters'),
  body('businessCategory')
    .trim()
    .notEmpty()
    .withMessage('Business category is required 🏷️'),
  body('phoneNumber')
    .matches(/^\+?[\d\s-]+$/)
    .withMessage('Invalid phone number format 📱'),
  body('businessLocation')
    .isObject()
    .withMessage('Business location is required 📍'),
  body('businessLocation.address')
    .trim()
    .notEmpty()
    .withMessage('Business address is required'),
  body('businessLocation.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('businessLocation.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('businessLocation.country')
    .trim()
    .notEmpty()
    .withMessage('Country is required'),
  body('businessLocation.zipCode')
    .trim()
    .matches(/^[A-Z\d]{3,10}$/i)
    .withMessage('Invalid zip code format'),
  body('businessLocation.coordinates')
    .isObject()
    .withMessage('Coordinates are required'),
  body('businessLocation.coordinates.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('businessLocation.coordinates.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('subscription.plan')
    .isIn(['basic', 'premium', 'enterprise'])
    .withMessage('Invalid subscription plan'),
  handleValidationErrors
];

// Widget customization validation rules 🎨
const widgetCustomizationValidation = [
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'custom'])
    .withMessage('Invalid theme selection'),
  body('position')
    .optional()
    .isIn(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .withMessage('Invalid position selection'),
  body('timing')
    .optional()
    .isIn(['immediate', 'delay', 'scroll', 'exit-intent'])
    .withMessage('Invalid timing selection'),
  body('animation')
    .optional()
    .isIn(['fade', 'slide', 'bounce'])
    .withMessage('Invalid animation selection'),
  body('customColors')
    .optional()
    .isObject()
    .withMessage('Custom colors must be an object'),
  body('customColors.primary')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid primary color format'),
  body('customColors.secondary')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid secondary color format'),
  body('displayRules')
    .optional()
    .isObject()
    .withMessage('Display rules must be an object'),
  body('displayRules.delay')
    .optional()
    .isInt({ min: 0, max: 60000 })
    .withMessage('Delay must be between 0 and 60000 milliseconds'),
  body('displayRules.scrollPercentage')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Scroll percentage must be between 0 and 100'),
  handleValidationErrors
];

// Voucher claim validation rules 🎟️
const voucherClaimValidation = [
  body('businessId')
    .notEmpty()
    .withMessage('Business ID is required')
    .isMongoId()
    .withMessage('Invalid business ID format'),
  body('couponId')
    .notEmpty()
    .withMessage('Coupon ID is required')
    .isMongoId()
    .withMessage('Invalid coupon ID format'),
  body('customerEmail')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address 📧')
    .normalizeEmail(),
  body('customerName')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required')
    .matches(/^[a-zA-Z]+(?: [a-zA-Z]+)*$/)
    .withMessage('Invalid customer name format'),
  body('phoneNumber')
    .optional()
    .matches(/^\+?[\d\s-]+$/)
    .withMessage('Invalid phone number format 📱'),
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  adminRegistrationValidation,
  profileUpdateValidation,
  gdprConsentValidation,
  businessProfileValidation,
  staffMemberValidation,
  businessRegistrationValidation,
  widgetCustomizationValidation,
  voucherClaimValidation
}; 