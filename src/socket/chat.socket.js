// Import dependencies 📦
const Message = require('../models/message.model');
const Conversation = require('../models/conversation.model');
const ChatNotification = require('../models/chatNotification.model');

// Active users map 👥
const activeUsers = new Map();

// Socket handler 🔌
const chatSocketHandler = (io, socket) => {
  const userId = socket.user.userId;
  
  // Add user to active users 👋
  activeUsers.set(userId, socket.id);
  
  // Join user's room 🏠
  socket.join(`user:${userId}`);
  
  // Handle disconnect 👋
  socket.on('disconnect', () => {
    activeUsers.delete(userId);
    io.emit('user:offline', { userId });
  });

  // Handle joining conversation 💬
  socket.on('conversation:join', async (conversationId) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId
      });

      if (conversation) {
        socket.join(`conversation:${conversationId}`);
        socket.to(`conversation:${conversationId}`).emit('user:joined', {
          userId,
          conversationId
        });
      }
    } catch (error) {
      console.error('Join conversation error:', error);
    }
  });

  // Handle leaving conversation 🚶
  socket.on('conversation:leave', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    socket.to(`conversation:${conversationId}`).emit('user:left', {
      userId,
      conversationId
    });
  });

  // Handle new message 📨
  socket.on('message:send', async (data) => {
    try {
      const { conversationId, content, replyTo } = data;

      // Verify user is participant
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId
      });

      if (!conversation) {
        socket.emit('error', {
          message: 'Not authorized to send message in this conversation! 🚫'
        });
        return;
      }

      // Create message
      const message = new Message({
        conversationId,
        sender: {
          userId,
          role: socket.user.role
        },
        content,
        replyTo
      });

      await message.save();

      // Update conversation
      await conversation.updateLastMessage(message._id, new Date());

      // Increment unread count for other participants
      const otherParticipants = conversation.participants
        .filter(p => p.userId.toString() !== userId.toString());

      for (const participant of otherParticipants) {
        conversation.incrementUnread(participant.userId);
      }

      await conversation.save();

      // Create notifications
      const notifications = otherParticipants.map(participant => new ChatNotification({
        userId: participant.userId,
        type: 'message_received',
        conversationId,
        messageId: message._id,
        title: 'New Message',
        body: content.text || 'New message received',
        data: {
          sender: {
            userId
          },
          preview: content.text
        }
      }));

      await ChatNotification.insertMany(notifications);

      // Emit to conversation room
      io.to(`conversation:${conversationId}`).emit('message:received', {
        message: {
          id: message._id,
          sender: message.sender,
          content: message.content,
          replyTo: message.replyTo,
          createdAt: message.createdAt
        }
      });

      // Emit to individual user rooms
      otherParticipants.forEach(participant => {
        io.to(`user:${participant.userId}`).emit('conversation:updated', {
          conversationId,
          lastMessage: {
            id: message._id,
            content: message.content,
            createdAt: message.createdAt
          }
        });
      });
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', {
        message: 'Failed to send message! 😢'
      });
    }
  });

  // Handle typing status 📝
  socket.on('typing:start', async ({ conversationId }) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId
      });

      if (conversation) {
        await conversation.setTyping(userId, true);
        socket.to(`conversation:${conversationId}`).emit('user:typing', {
          userId,
          conversationId
        });
      }
    } catch (error) {
      console.error('Typing start error:', error);
    }
  });

  socket.on('typing:stop', async ({ conversationId }) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId
      });

      if (conversation) {
        await conversation.setTyping(userId, false);
        socket.to(`conversation:${conversationId}`).emit('user:stopped-typing', {
          userId,
          conversationId
        });
      }
    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Handle read receipts 👁️
  socket.on('message:read', async ({ conversationId }) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId
      });

      if (conversation) {
        await conversation.markAsRead(userId);
        
        // Mark messages as read
        await Message.updateMany(
          {
            conversationId,
            'readBy.userId': { $ne: userId }
          },
          {
            $push: {
              readBy: {
                userId,
                readAt: new Date()
              }
            }
          }
        );

        socket.to(`conversation:${conversationId}`).emit('message:seen', {
          userId,
          conversationId
        });
      }
    } catch (error) {
      console.error('Message read error:', error);
    }
  });
};

module.exports = chatSocketHandler; 