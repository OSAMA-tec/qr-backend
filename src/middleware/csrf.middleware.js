// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: true  // Just use default cookie settings
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
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
  res.json({
    success: true,
    token: token
  });
};

module.exports = {
  cookieParser,
  csrfProtection,
  handleCSRFError,
  generateToken
}; 