// Import dependencies 📦
const mongoose = require('mongoose');

// Message Schema 💬
const messageSchema = new mongoose.Schema({
  // Conversation Reference
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },

  // Sender Info
  sender: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'business'],
      required: true
    }
  },

  // Message Content
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'action'],
    default: 'text'
  },
  content: {
    text: String,
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    fileMimeType: String,
    imageUrl: String,
    imageWidth: Number,
    imageHeight: Number,
    actionType: {
      type: String,
      enum: ['status_change', 'priority_change', 'participant_added', 'participant_removed']
    },
    actionData: mongoose.Schema.Types.Mixed
  },

  // Message Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Reply Reference
  replyTo: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: String  // Preview of replied message
  },

  // Message Metadata
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  deliveryStatus: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['delivered', 'read'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Error Handling
  error: {
    code: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
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
  deletedAt: Date
});

// Indexes 📇
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ 'sender.userId': 1 });
messageSchema.index({ type: 1 });
messageSchema.index({ status: 1 });

// Update timestamps on save ⏰
messageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods 🛠️
messageSchema.methods.markAsRead = async function(userId) {
  if (!this.readBy.some(read => read.userId.toString() === userId.toString())) {
    this.readBy.push({ userId, readAt: new Date() });
    await this.save();
  }
};

messageSchema.methods.markAsDelivered = async function(userId) {
  if (!this.deliveryStatus.some(status => status.userId.toString() === userId.toString())) {
    this.deliveryStatus.push({
      userId,
      status: 'delivered',
      timestamp: new Date()
    });
    this.status = 'delivered';
    await this.save();
  }
};

messageSchema.methods.editMessage = async function(newContent) {
  if (this.content.text) {
    this.editHistory.push({
      content: this.content.text,
      editedAt: new Date()
    });
  }
  this.content.text = newContent;
  this.isEdited = true;
  await this.save();
};

messageSchema.methods.softDelete = async function() {
  this.deletedAt = new Date();
  await this.save();
};

// Statics 📊
messageSchema.statics.findByConversation = function(conversationId, limit = 50, before = Date.now()) {
  return this.find({
    conversationId,
    createdAt: { $lt: before },
    deletedAt: null
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender.userId', 'firstName lastName avatar')
    .populate('readBy.userId', 'firstName lastName');
};

messageSchema.statics.findUnreadByUser = function(userId) {
  return this.find({
    'readBy.userId': { $ne: userId },
    deletedAt: null
  }).populate('conversationId');
};

// Create model 🏗️
const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 