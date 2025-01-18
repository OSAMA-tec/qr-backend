// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  value: (req) => {
    return (
      req.headers['csrf-token'] ||
      req.headers['xsrf-token'] ||
      req.headers['x-csrf-token'] ||
      req.headers['x-xsrf-token']
    );
  }
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // Log error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error('CSRF Error:', {
      url: req.url,
      method: req.method,
      headers: req.headers,
      error: err.message
    });
  }
  
  res.status(403).json({
    success: false,
    message: 'Invalid CSRF token 🚫',
    details: process.env.NODE_ENV === 'development' ? {
      received: req.headers['csrf-token'] || req.headers['xsrf-token'] || 'No token found',
      error: err.message
    } : undefined
  });
};

// Generate CSRF token endpoint 🎟️
const generateToken = (req, res) => {
  try {
    const token = req.csrfToken();
    
    // Set token in cookie and header
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    
    res.json({
      success: true,
      message: 'CSRF token generated successfully 🔑',
      token
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate CSRF token ❌',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  cookieParser,
  csrfProtection,
  handleCSRFError,
  generateToken
}; 