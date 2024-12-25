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

// Popup settings validation rules 🎯
const popupSettingsValidation = [
  body('template')
    .isIn(['default', 'modern', 'festive'])
    .withMessage('Invalid template selection'),
  body('timing')
    .isObject()
    .withMessage('Timing settings must be an object'),
  body('timing.displayDelay')
    .isInt({ min: 0, max: 60000 })
    .withMessage('Display delay must be between 0 and 60000 milliseconds'),
  body('timing.displayFrequency')
    .isIn(['once-per-session', 'once-per-day', 'every-time', 'once-only'])
    .withMessage('Invalid display frequency'),
  body('timing.scrollTrigger')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Scroll trigger must be between 0 and 100 percent'),
  body('design')
    .isObject()
    .withMessage('Design settings must be an object'),
  body('design.layout')
    .isIn(['centered', 'right-aligned', 'left-aligned', 'full-width'])
    .withMessage('Invalid layout selection'),
  body('design.colors')
    .isObject()
    .withMessage('Colors must be an object'),
  body('design.colors.background')
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid background color format'),
  body('design.colors.text')
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid text color format'),
  body('design.colors.button')
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid button color format'),
  body('design.logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  body('content')
    .isObject()
    .withMessage('Content settings must be an object'),
  body('content.title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title must be less than 100 characters'),
  body('content.description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('content.buttonText')
    .trim()
    .notEmpty()
    .withMessage('Button text is required')
    .isLength({ max: 30 })
    .withMessage('Button text must be less than 30 characters'),
  handleValidationErrors
];

// Popup preview validation rules 👁️
const popupPreviewValidation = [
  body('template')
    .isIn(['default', 'modern', 'festive'])
    .withMessage('Invalid template selection'),
  body('settings')
    .isObject()
    .withMessage('Settings must be an object'),
  body('settings.colors')
    .optional()
    .isObject()
    .withMessage('Colors must be an object'),
  body('settings.colors.background')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid background color format'),
  body('settings.colors.text')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid text color format'),
  body('settings.colors.button')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Invalid button color format'),
  body('settings.logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  body('content')
    .isObject()
    .withMessage('Content must be an object'),
  body('content.title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title must be less than 100 characters'),
  body('content.description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('content.buttonText')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Button text must be less than 30 characters'),
  handleValidationErrors
];

// Voucher creation validation rules 🎟️
const voucherCreationValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Voucher title is required 📝')
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('discountType')
    .isIn(['percentage', 'fixed'])
    .withMessage('Invalid discount type 🏷️'),
  
  body('discountValue')
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number 💰')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage' && value > 100) {
        throw new Error('Percentage discount cannot exceed 100% 📊');
      }
      return true;
    }),
  
  body('startDate')
    .isISO8601()
    .withMessage('Invalid start date format 📅')
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error('Start date cannot be in the past ⏰');
      }
      return true;
    }),
  
  body('endDate')
    .isISO8601()
    .withMessage('Invalid end date format 📅')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date ⏰');
      }
      return true;
    }),
  
  body('usageLimit.perCoupon')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Usage limit per coupon must be at least 1 🎯'),
  
  body('usageLimit.perCustomer')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Usage limit per customer must be at least 1 👤'),
  
  body('minimumPurchase')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum purchase amount must be a positive number 💰'),
  
  body('maximumDiscount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount must be a positive number 💰'),
  
  handleValidationErrors
];

// Voucher update validation rules ✏️
const voucherUpdateValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format 📅'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format 📅')
    .custom((value, { req }) => {
      if (req.body.startDate && new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date ⏰');
      }
      return true;
    }),
  
  body('minimumPurchase')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum purchase amount must be a positive number 💰'),
  
  body('maximumDiscount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount must be a positive number 💰'),
  
  handleValidationErrors
];

// Voucher validation rules 🔍
const voucherValidationRules = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Voucher code is required 🎫'),
  
  body('businessId')
    .isMongoId()
    .withMessage('Invalid business ID format 🏢'),
  
  body('customerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid customer ID format 👤'),
  
  handleValidationErrors
];

// Voucher redemption validation rules 💫
const voucherRedemptionValidation = [
  body('voucherId')
    .isMongoId()
    .withMessage('Invalid voucher ID format 🎫'),
  
  body('customerId')
    .isMongoId()
    .withMessage('Invalid customer ID format 👤'),
  
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number 💰'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object 📍'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude value 🌍'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude value 🌍'),
  
  handleValidationErrors
];

// QR code generation validation rules 🎨
const qrCodeGenerationValidation = [
  body('voucherId')
    .isMongoId()
    .withMessage('Invalid voucher ID format 🎫'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object 📝'),
  
  handleValidationErrors
];

// Bulk QR code generation validation rules 🎯
const bulkQRCodeGenerationValidation = [
  body('voucherId')
    .isMongoId()
    .withMessage('Invalid voucher ID format 🎫'),
  
  body('quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be between 1 and 1000 🔢'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object 📝'),
  
  handleValidationErrors
];

// QR code scan validation rules 📱
const qrCodeScanValidation = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('QR code is required 🎫'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object 📍'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude value 🌍'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude value 🌍'),
  
  body('deviceInfo')
    .optional()
    .isObject()
    .withMessage('Device info must be an object 📱'),
  
  body('deviceInfo.type')
    .optional()
    .isIn(['ios', 'android', 'web'])
    .withMessage('Invalid device type'),
  
  body('deviceInfo.model')
    .optional()
    .isString()
    .withMessage('Device model must be a string'),
  
  body('deviceInfo.os')
    .optional()
    .isString()
    .withMessage('Operating system must be a string'),
  
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
  voucherClaimValidation,
  popupSettingsValidation,
  popupPreviewValidation,
  voucherCreationValidation,
  voucherUpdateValidation,
  voucherValidationRules,
  voucherRedemptionValidation,
  qrCodeGenerationValidation,
  bulkQRCodeGenerationValidation,
  qrCodeScanValidation
}; 