// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    key: '_csrf', // 🔑 Specific cookie name
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'], // 🚦 Skip for safe methods
  value: (req) => {
    // 🔍 Check multiple header variations
    return (
      req.headers['csrf-token'] ||
      req.headers['xsrf-token'] ||
      req.headers['x-csrf-token'] ||
      req.headers['x-xsrf-token'] ||
      (req.body && req.body._csrf) ||  // Check body
      (req.query && req.query._csrf)    // Check query params
    );
  }
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // 📝 Enhanced error logging
  if (process.env.NODE_ENV === 'development') {
    console.error('CSRF Error:', {
      url: req.url,
      method: req.method,
      headers: {
        'csrf-token': req.headers['csrf-token'],
        'xsrf-token': req.headers['xsrf-token'],
        'x-csrf-token': req.headers['x-csrf-token'],
        'x-xsrf-token': req.headers['x-xsrf-token']
      },
      cookies: req.cookies,
      error: err.message
    });
  }
  
  res.status(403).json({
    success: false,
    message: 'Invalid CSRF token 🚫',
    details: process.env.NODE_ENV === 'development' ? {
      received: req.headers['csrf-token'] || 
               req.headers['xsrf-token'] || 
               req.headers['x-csrf-token'] ||
               req.headers['x-xsrf-token'] ||
               'No token found',
      error: err.message,
      cookies: req.cookies
    } : undefined
  });
};

// Generate CSRF token endpoint 🎟️
const generateToken = (req, res) => {
  try {
    const token = req.csrfToken();
    
    // Set both cookie variations for maximum compatibility
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,  // 👀 Allows JavaScript access
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    
    res.cookie('_csrf', token, {
      httpOnly: true,  // 🔒 Server-only access
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    
    // Set header for immediate use
    res.set('X-CSRF-Token', token);
    
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