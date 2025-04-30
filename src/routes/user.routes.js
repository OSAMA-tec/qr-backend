// Import dependencies 📦
const router = require('express').Router();
const multer = require('multer');
const {
  updateProfile,
  getProfile,
  getWalletPasses,
  uploadProfilePic,
  deleteProfilePic,
  getAllCustomers,
  getCustomerDetails,
  softDeleteCustomer
} = require('../controllers/user.controller');

const { csrfProtection } = require('../middleware/csrf.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { profileUpdateValidation } = require('../middleware/validation.middleware');

// Configure multer for profile picture upload 📸
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed! 🖼️'), false);
    }
  }
});

// const isAdminMiddleware = (req, res, next) => {
//   console.log(req.user)
//   if (req.user.role !== 'admin') {
//     return res.status(403).json({
//       success: false,
//       message: 'Access denied! Only admins can access this resource 🚫'
//     });
//   }
//   next();
// };

// Admin routes 👑
router.get('/customers', authMiddleware, getAllCustomers);
router.get('/customers/:id', authMiddleware, getCustomerDetails);
router.delete('/customers/:id', authMiddleware, softDeleteCustomer);

// Protected routes 🔒
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, profileUpdateValidation, updateProfile);
router.get('/wallet', authMiddleware, getWalletPasses);
router.post('/profile/picture', authMiddleware, upload.single('profilePic'), uploadProfilePic);
router.delete('/profile/picture', authMiddleware, deleteProfilePic);

module.exports = router;