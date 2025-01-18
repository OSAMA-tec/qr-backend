// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',  // Changed to 'strict' for better compatibility
    maxAge: 7200 // 2 hours
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) => {
    // Check multiple header variations for the token
    const token = 
      req.headers['x-xsrf-token'] || 
      req.headers['x-csrf-token'] || 
      req.headers['csrf-token'] ||
      req.body._csrf ||
      req.query._csrf;

    // Log token in development
    if (process.env.NODE_ENV === 'development') {
      console.log('CSRF Token received:', token);
    }

    return token;
  }
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // Log detailed error info in development
  if (process.env.NODE_ENV === 'development') {
    console.error('CSRF Error:', err.message);
    console.error('Headers received:', req.headers);
    console.error('Token received:', req.headers['x-xsrf-token'] || req.headers['x-csrf-token'] || req.headers['csrf-token']);
    console.error('Method:', req.method);
    console.error('URL:', req.url);
  }
  
  res.status(403).json({
    success: false,
    message: 'CSRF token validation failed! 🚫',
    error: 'Invalid or missing CSRF token'
  });
};

// Generate CSRF token endpoint 🎟️
const generateToken = (req, res) => {
  const token = req.csrfToken();

  // Set CSRF token in cookie with compatible settings
  res.cookie('XSRF-TOKEN', token, {
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7200000 // 2 hours in milliseconds
  });

  // Also set it in response headers
  res.set({
    'X-CSRF-Token': token,
    'Access-Control-Expose-Headers': 'X-CSRF-Token'
  });

  res.json({
    success: true,
    message: 'CSRF token generated! 🎉',
    token: token
  });
};

module.exports = {
  cookieParser,
  csrfProtection,
  handleCSRFError,
  generateToken
}; 