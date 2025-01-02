// Import dependencies 📦
const mongoose = require('mongoose');

// Conversation Schema 💬
const conversationSchema = new mongoose.Schema({
  // Participants
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'business'],
      required: true
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  }],

  // Conversation Details
  type: {
    type: String,
    enum: ['support', 'general', 'urgent'],
    default: 'general'
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'archived'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Metadata
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageTimestamp: {
    type: Date
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()  // Maps userId to their unread count
  },
  isTyping: {
    type: Map,
    of: Boolean,
    default: new Map()  // Maps userId to their typing status
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date,
  archivedAt: Date
});

// Indexes 📇
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ status: 1, updatedAt: -1 });
conversationSchema.index({ type: 1, priority: 1 });

// Update timestamps on save ⏰
conversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods 🛠️
conversationSchema.methods.markAsRead = async function(userId) {
  this.unreadCount.set(userId.toString(), 0);
  await this.save();
};

conversationSchema.methods.incrementUnreadCount = async function(excludeUserId) {
  for (const participant of this.participants) {
    if (participant.userId.toString() !== excludeUserId.toString()) {
      const currentCount = this.unreadCount.get(participant.userId.toString()) || 0;
      this.unreadCount.set(participant.userId.toString(), currentCount + 1);
    }
  }
  await this.save();
};

conversationSchema.methods.setTypingStatus = async function(userId, isTyping) {
  this.isTyping.set(userId.toString(), isTyping);
  await this.save();
};

conversationSchema.methods.updateLastMessage = async function(messageId, timestamp) {
  this.lastMessage = messageId;
  this.lastMessageTimestamp = timestamp;
  await this.save();
};

// Statics 📊
conversationSchema.statics.findByParticipant = function(userId) {
  return this.find({
    'participants.userId': userId
  }).sort({ updatedAt: -1 });
};

conversationSchema.statics.findActiveByParticipant = function(userId) {
  return this.find({
    'participants.userId': userId,
    status: 'active'
  }).sort({ updatedAt: -1 });
};

// Create model 🏗️
const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation; 