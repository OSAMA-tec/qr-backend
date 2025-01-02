// Import dependencies 📦
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// Socket middleware 🔒
const socketMiddleware = async (socket, next) => {
  try {
    // Get token from handshake auth 🔑
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication token required! 🔒'));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user
    const user = await User.findById(decoded.userId)
      .select('_id role firstName lastName avatar');

    if (!user) {
      return next(new Error('User not found! 🔍'));
    }

    // Attach user to socket
    socket.user = {
      userId: user._id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar
    };

    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    next(new Error('Invalid authentication token! ❌'));
  }
};

// Error handler 🚨
const socketErrorHandler = (io) => {
  io.on('error', (error) => {
    console.error('Socket error:', error);
  });

  io.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });
};

module.exports = {
  socketMiddleware,
  socketErrorHandler
}; 