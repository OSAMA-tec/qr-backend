// Import dependencies 📦
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const ChatNotification = require('../models/chatNotification.model');
const { uploadToS3 } = require('../utils/upload.utils');

// Get conversations 📋
const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { 'participants.userId': req.user.userId };
    
    if (status) {
      query.status = status;
    }

    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('participants.userId', 'firstName lastName avatar')
      .populate('lastMessage');

    const total = await Conversation.countDocuments(query);

    res.json({
      success: true,
      data: {
        conversations: conversations.map(conv => ({
          id: conv._id,
          subject: conv.subject,
          type: conv.type,
          status: conv.status,
          priority: conv.priority,
          participants: conv.participants,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount.get(req.user.userId.toString()) || 0,
          updatedAt: conv.updatedAt
        })),
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations! 😢'
    });
  }
};

// Get single conversation 💬
const getConversationById = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      'participants.userId': req.user.userId
    })
      .populate('participants.userId', 'firstName lastName avatar email')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found! 🔍'
      });
    }

    res.json({
      success: true,
      data: {
        id: conversation._id,
        subject: conversation.subject,
        type: conversation.type,
        status: conversation.status,
        priority: conversation.priority,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage,
        unreadCount: conversation.unreadCount.get(req.user.userId.toString()) || 0,
        isTyping: Object.fromEntries(conversation.isTyping),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation! 😢'
    });
  }
};

// Create new conversation 🆕
const createConversation = async (req, res) => {
  try {
    const { subject, type = 'general', message } = req.body;

    // Find admin to add to conversation
    const adminParticipant = {
      userId: process.env.SUPPORT_ADMIN_ID, // Default support admin
      role: 'admin'
    };

    const businessParticipant = {
      userId: req.user.userId,
      role: 'business'
    };

    // Create conversation
    const conversation = new Conversation({
      participants: [adminParticipant, businessParticipant],
      subject,
      type
    });

    await conversation.save();

    // Create initial message if provided
    if (message) {
      const newMessage = new Message({
        conversationId: conversation._id,
        sender: {
          userId: req.user.userId,
          role: 'business'
        },
        content: {
          text: message
        }
      });

      await newMessage.save();
      await conversation.updateLastMessage(newMessage._id, new Date());
    }

    // Create notification for admin
    const notification = new ChatNotification({
      userId: adminParticipant.userId,
      type: 'conversation_created',
      conversationId: conversation._id,
      title: 'New Support Conversation',
      body: `New ${type} conversation: ${subject}`,
      data: {
        sender: {
          userId: req.user.userId
        },
        preview: message || subject
      }
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully! 🎉',
      data: {
        conversationId: conversation._id
      }
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create conversation! 😢'
    });
  }
};

// Update conversation status 📝
const updateConversationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      'participants.userId': req.user.userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found! 🔍'
      });
    }

    // Only admin can update status
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can update conversation status! 🚫'
      });
    }

    conversation.status = status;
    if (status === 'resolved') {
      conversation.resolvedAt = new Date();
    } else if (status === 'archived') {
      conversation.archivedAt = new Date();
    }

    await conversation.save();

    // Create system message
    const systemMessage = new Message({
      conversationId: conversation._id,
      sender: {
        userId: req.user.userId,
        role: 'admin'
      },
      type: 'system',
      content: {
        actionType: 'status_change',
        actionData: {
          oldStatus: conversation.status,
          newStatus: status
        }
      }
    });

    await systemMessage.save();

    // Notify other participants
    const notifications = conversation.participants
      .filter(p => p.userId.toString() !== req.user.userId.toString())
      .map(participant => new ChatNotification({
        userId: participant.userId,
        type: 'status_change',
        conversationId: conversation._id,
        messageId: systemMessage._id,
        title: 'Conversation Status Updated',
        body: `Conversation marked as ${status}`,
        data: {
          sender: {
            userId: req.user.userId
          }
        }
      }));

    await ChatNotification.insertMany(notifications);

    res.json({
      success: true,
      message: `Conversation marked as ${status}! ✅`,
      data: {
        status,
        updatedAt: conversation.updatedAt
      }
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update conversation status! 😢'
    });
  }
};

// Get unread count 🔢
const getUnreadCount = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      'participants.userId': req.user.userId
    });

    const totalUnread = conversations.reduce((total, conv) => {
      return total + (conv.unreadCount.get(req.user.userId.toString()) || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        unreadCount: totalUnread
      }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count! 😢'
    });
  }
};

// Mark conversation as read 👁️
const markConversationAsRead = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      'participants.userId': req.user.userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found! 🔍'
      });
    }

    await conversation.markAsRead(req.user.userId);

    // Mark all messages as read
    await Message.updateMany(
      {
        conversationId: conversation._id,
        'readBy.userId': { $ne: req.user.userId }
      },
      {
        $push: {
          readBy: {
            userId: req.user.userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: 'Marked as read! ✅'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark conversation as read! 😢'
    });
  }
};

// Get conversation messages 💬
const getConversationMessages = async (req, res) => {
  try {
    const { before, limit = 50 } = req.query;
    const messages = await Message.findByConversation(
      req.params.id,
      parseInt(limit),
      before ? new Date(before) : Date.now()
    );

    res.json({
      success: true,
      data: {
        messages: messages.map(msg => ({
          id: msg._id,
          sender: msg.sender,
          type: msg.type,
          content: msg.content,
          status: msg.status,
          readBy: msg.readBy,
          replyTo: msg.replyTo,
          isEdited: msg.isEdited,
          createdAt: msg.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages! 😢'
    });
  }
};

// Delete message 🗑️
const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      'sender.userId': req.user.userId,
      deletedAt: null
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already deleted! 🔍'
      });
    }

    await message.softDelete();

    res.json({
      success: true,
      message: 'Message deleted! 🗑️'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message! 😢'
    });
  }
};

// Upload attachment 📎
const uploadAttachment = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded! 📁'
      });
    }

    const file = req.files.file;
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File too large! Maximum size is 10MB 📦'
      });
    }

    // Upload to S3
    const uploadResult = await uploadToS3(file, 'chat-attachments');

    res.json({
      success: true,
      data: {
        url: uploadResult.url,
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file! 😢'
    });
  }
};

module.exports = {
  getConversations,
  getConversationById,
  createConversation,
  updateConversationStatus,
  getUnreadCount,
  markConversationAsRead,
  getConversationMessages,
  deleteMessage,
  uploadAttachment
}; 