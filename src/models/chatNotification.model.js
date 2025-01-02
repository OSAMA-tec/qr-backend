// Import dependencies 📦
const mongoose = require('mongoose');

// Chat notification schema 🔔
const chatNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'conversation_created',
      'message_received',
      'status_change',
      'mention',
      'reaction_added'
    ]
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  data: {
    sender: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    preview: String,
    actionType: String,
    actionData: mongoose.Schema.Types.Mixed
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60 // Auto delete after 30 days
  }
}, {
  timestamps: true
});

// Indexes for faster queries 🔍
chatNotificationSchema.index({ userId: 1, createdAt: -1 });
chatNotificationSchema.index({ conversationId: 1, createdAt: -1 });
chatNotificationSchema.index({ isRead: 1, createdAt: -1 });

// Mark notification as read 👁️
chatNotificationSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
};

// Get unread count 🔢
chatNotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    userId,
    isRead: false
  });
};

// Get notifications 📋
chatNotificationSchema.statics.getNotifications = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false
  } = options;

  const query = { userId };
  if (unreadOnly) {
    query.isRead = false;
  }

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('data.sender.userId', 'firstName lastName avatar'),
    this.countDocuments(query)
  ]);

  return {
    notifications,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  };
};

// Create model 🏗️
const ChatNotification = mongoose.model('ChatNotification', chatNotificationSchema);

module.exports = ChatNotification; 