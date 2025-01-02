// Import dependencies 📦
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const ChatNotification = require('../models/chatNotification.model');

// Socket event handlers 🎯
const chatSocket = (io) => {
  // Authentication middleware 🔒
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required! 🔑'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        userId: decoded.userId,
        role: decoded.role
      };
      next();
    } catch (error) {
      next(new Error('Invalid authentication token! 🚫'));
    }
  });

  // Connection handler 🔌
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.userId} (${socket.user.role}) 🟢`);

    // Join user's room
    socket.join(socket.user.userId);

    try {
      // Update online status
      await Conversation.updateMany(
        { 'participants.userId': socket.user.userId },
        { $set: { 'participants.$.isOnline': true } }
      );

      // Notify other participants
      socket.broadcast.emit('user:online', {
        userId: socket.user.userId,
        role: socket.user.role
      });
    } catch (error) {
      console.error('Connection error:', error);
    }

    // Message handlers 💬
    socket.on('message:send', async (data) => {
      try {
        const { conversationId, content, type = 'text', replyTo } = data;

        // Validate conversation access
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': socket.user.userId
        });

        if (!conversation) {
          socket.emit('error', {
            message: 'Conversation not found or access denied! 🚫'
          });
          return;
        }

        // Create message
        const message = new Message({
          conversationId,
          sender: {
            userId: socket.user.userId,
            role: socket.user.role
          },
          type,
          content: {
            text: content,
            ...(type !== 'text' && data.content)
          },
          ...(replyTo && { replyTo })
        });

        await message.save();

        // Update conversation
        await conversation.updateLastMessage(message._id, new Date());
        await conversation.incrementUnreadCount(socket.user.userId);

        // Create notifications
        const notifications = conversation.participants
          .filter(p => p.userId.toString() !== socket.user.userId.toString())
          .map(participant => new ChatNotification({
            userId: participant.userId,
            type: 'new_message',
            conversationId,
            messageId: message._id,
            title: 'New Message',
            body: type === 'text' ? content : `New ${type} message`,
            data: {
              sender: {
                userId: socket.user.userId,
                name: socket.user.name
              },
              preview: type === 'text' ? content.substring(0, 100) : `[${type}]`
            }
          }));

        await ChatNotification.insertMany(notifications);

        // Broadcast to participants
        conversation.participants.forEach(participant => {
          if (participant.userId.toString() !== socket.user.userId.toString()) {
            io.to(participant.userId.toString()).emit('message:received', {
              message,
              conversation: conversationId
            });
          }
        });

        socket.emit('message:sent', { message });
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', {
          message: 'Failed to send message! 😢',
          error: error.message
        });
      }
    });

    // Typing indicator 📝
    socket.on('typing:start', async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.setTypingStatus(socket.user.userId, true);
          socket.to(conversationId).emit('user:typing', {
            userId: socket.user.userId,
            conversationId
          });
        }
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    socket.on('typing:stop', async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.setTypingStatus(socket.user.userId, false);
          socket.to(conversationId).emit('user:stopped_typing', {
            userId: socket.user.userId,
            conversationId
          });
        }
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // Read receipts 👁️
    socket.on('message:read', async ({ conversationId, messageId }) => {
      try {
        const [conversation, message] = await Promise.all([
          Conversation.findById(conversationId),
          Message.findById(messageId)
        ]);

        if (conversation && message) {
          await Promise.all([
            conversation.markAsRead(socket.user.userId),
            message.markAsRead(socket.user.userId)
          ]);

          socket.to(conversationId).emit('message:read_by', {
            userId: socket.user.userId,
            messageId,
            conversationId
          });
        }
      } catch (error) {
        console.error('Read receipt error:', error);
      }
    });

    // Disconnect handler 🔌
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.userId} 🔴`);
      
      try {
        // Update online status
        await Conversation.updateMany(
          { 'participants.userId': socket.user.userId },
          { 
            $set: { 
              'participants.$.isOnline': false,
              'participants.$.lastSeen': new Date()
            }
          }
        );

        // Notify other participants
        socket.broadcast.emit('user:offline', {
          userId: socket.user.userId,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });
};

module.exports = chatSocket; 