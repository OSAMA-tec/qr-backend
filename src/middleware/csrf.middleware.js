// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// CSRF protection middleware 🛡️
const csrfProtection = csrf({
  cookie: {
    key: '_csrf-token', // Name of the cookie
    httpOnly: true,     // Cookie cannot be read by client-side JS
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    sameSite: 'strict', // Protect against CSRF
    maxAge: 3600       // 1 hour in seconds
  }
});

// Error handler for CSRF 🚫
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // Handle CSRF token errors here
  res.status(403).json({
    message: 'CSRF token validation failed! 🚫',
    error: 'Invalid or missing CSRF token'
  });
};

module.exports = {
  cookieParser,
  csrfProtection,
  handleCSRFError
}; 