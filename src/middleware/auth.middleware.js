// Import JWT utils 🔑
const { verifyAccessToken } = require('../utils/jwt.utils');

// Auth middleware to protect routes 🛡️
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header 📨
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided! 🚫' });
    }

    // Verify token ✅
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired token! ⚠️' });
    }

    // Add user to request 👤
    req.user = { 
      userId: decoded.userId,
      role: decoded.role
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Authentication failed! 😢' });
  }
};

module.exports = authMiddleware; 