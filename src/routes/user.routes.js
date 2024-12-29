// Import dependencies 📦
const router = require('express').Router();
const {
  updateProfile,
  getProfile,
  getWalletPasses,
  uploadProfilePic,
  deleteProfilePic,
  getAllCustomers,
  getCustomerDetails
} = require('../controllers/user.controller');

const { csrfProtection } = require('../middleware/csrf.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { profileUpdateValidation } = require('../middleware/validation.middleware');
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
// Admin routes 👑
router.get('/customers', authMiddleware, getAllCustomers);
router.get('/customers/:id', authMiddleware, getCustomerDetails);

// Protected routes 🔒
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, csrfProtection, profileUpdateValidation, updateProfile);
router.get('/wallet', authMiddleware, getWalletPasses);
router.post('/profile/picture', authMiddleware, csrfProtection, uploadProfilePic);
router.delete('/profile/picture', authMiddleware, csrfProtection, deleteProfilePic);

module.exports = router;