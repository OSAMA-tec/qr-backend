// Import dependencies 📦
const router = require('express').Router();
const authMiddleware = require('../middleware/auth.middleware');
const { csrfProtection } = require('../middleware/csrf.middleware');

// Import controllers
const {
  getConversations,
  getConversationById,
  createConversation,
  updateConversationStatus,
  getUnreadCount,
  markConversationAsRead,
  getConversationMessages,
  deleteMessage,
  uploadAttachment
} = require('../controllers/chat.controller');

// Custom middleware to check roles 🔒
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Admin only resource 🚫'
    });
  }
  next();
};

const isBusiness = (req, res, next) => {
  if (req.user.role !== 'business') {
    return res.status(403).json({
      success: false,
      message: 'Access denied! Business only resource 🚫'
    });
  }
  next();
};

// Admin Routes 👑
router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/conversations', getConversations);  // Get all conversations
router.get('/admin/conversations/:id', getConversationById);  // Get single conversation
router.put('/admin/conversations/:id/status', updateConversationStatus);  // Update status
router.get('/admin/unread', getUnreadCount);  // Get unread count
router.post('/admin/conversations/:id/read', markConversationAsRead);  // Mark as read
router.get('/admin/conversations/:id/messages', getConversationMessages);  // Get messages
router.delete('/admin/messages/:id', deleteMessage);  // Delete message
router.post('/admin/upload', csrfProtection, uploadAttachment);  // Upload file

// Business Routes 💼
router.use('/business', authMiddleware, isBusiness);
router.get('/business/conversations', getConversations);  // Get own conversations
router.get('/business/conversations/:id', getConversationById);  // Get single conversation
router.post('/business/conversations', csrfProtection, createConversation);  // Create new conversation
router.get('/business/unread', getUnreadCount);  // Get unread count
router.post('/business/conversations/:id/read', markConversationAsRead);  // Mark as read
router.get('/business/conversations/:id/messages', getConversationMessages);  // Get messages
router.delete('/business/messages/:id', deleteMessage);  // Delete own message
router.post('/business/upload', csrfProtection, uploadAttachment);  // Upload file

module.exports = router; 