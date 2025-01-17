// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    secure: true, // Always use secure in production
    sameSite: 'none', // Allow cross-site cookie
    maxAge: 7200 // 2 hours
  },
  value: (req) => {
    // Check for token in different places
    return (
      req.headers['x-xsrf-token'] || 
      req.headers['x-csrf-token'] || 
      req.headers['csrf-token'] ||
      req.body._csrf ||
      req.query._csrf
    );
  }
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  console.error('CSRF Error:', err.message);
  console.error('Headers received:', req.headers);
  console.error('Token received:', req.headers['x-xsrf-token'] || req.headers['x-csrf-token'] || req.headers['csrf-token']);
  
  // Return user-friendly error
  res.status(403).json({
    success: false,
    message: 'CSRF token validation failed! 🚫',
    error: 'Invalid or missing CSRF token'
  });
};

// Generate CSRF token endpoint 🎟️
const generateToken = (req, res) => {
  const token = req.csrfToken();

  // Set CSRF token in cookie with proper settings
  res.cookie('XSRF-TOKEN', token, {
    secure: true, // Always use secure
    sameSite: 'none', // Allow cross-site cookie
    maxAge: 7200000, // 2 hours in milliseconds
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined // Use if needed for subdomain support
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