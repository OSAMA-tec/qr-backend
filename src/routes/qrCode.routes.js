// Import dependencies 📦
const router = require('express').Router();
const {
  generateQRCode,
  getQRCodeDetails,
  bulkGenerateQRCodes,
  validateQRCode,
  processQRCodeScan
} = require('../controllers/qrCode.controller');

const {
  qrCodeGenerationValidation,
  bulkQRCodeGenerationValidation,
  qrCodeScanValidation
} = require('../middleware/validation.middleware');

const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Custom middleware to check if user is business 🏢
const isBusinessMiddleware = (req, res, next) => {
  if (req.user.role !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Only business accounts can access this resource 🚫'
    });
  }
  next();
};

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

// QR code generation routes
router.post('/generate', qrCodeGenerationValidation, generateQRCode); //tt
router.post('/bulk-generate', bulkQRCodeGenerationValidation, bulkGenerateQRCodes); //tt

// QR code details route
router.get('/:id', getQRCodeDetails);

// QR code validation route (public route)
router.get('/validate/:code', validateQRCode);

// QR code scan processing route
router.post('/scan', qrCodeScanValidation, processQRCodeScan); //tt

module.exports = router; 