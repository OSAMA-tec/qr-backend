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
router.put('/profile', authMiddleware, profileUpdateValidation, updateProfile); //tt
router.get('/wallet', authMiddleware, getWalletPasses);
router.post('/profile/picture', authMiddleware, uploadProfilePic); //tt
router.delete('/profile/picture', authMiddleware, deleteProfilePic); //tt

module.exports = router;