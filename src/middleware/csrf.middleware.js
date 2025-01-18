// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configure CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    key: 'XSRF-TOKEN', // 🔑 Match frontend cookie name
    httpOnly: false,   // Allow frontend access
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'], // 🚦 Skip for safe methods
  value: (req) => {
    // 🔍 Get token from headers (match frontend naming)
    const token = 
      req.headers['x-xsrf-token'] || // Primary header name
      req.headers['xsrf-token'] ||   // Fallback variations
      req.headers['x-csrf-token'] ||
      req.headers['csrf-token'];
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Token debug:', {
        receivedToken: token,
        headers: req.headers,
        cookies: req.cookies
      });
    }
    
    return token;
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
        'x-xsrf-token': req.headers['x-xsrf-token'],
        'xsrf-token': req.headers['xsrf-token'],
        'x-csrf-token': req.headers['x-csrf-token'],
        'csrf-token': req.headers['csrf-token']
      },
      cookies: req.cookies,
      error: err.message
    });
  }
  
  res.status(403).json({
    success: false,
    message: 'Invalid CSRF token 🚫',
    details: process.env.NODE_ENV === 'development' ? {
      received: req.headers['x-xsrf-token'] || 
               req.headers['xsrf-token'] || 
               req.headers['x-csrf-token'] ||
               req.headers['csrf-token'] ||
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
    
    // Set single cookie with frontend-accessible settings
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,  // 👀 Allows JavaScript access
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    
    // Also set header for immediate use
    res.set('X-XSRF-TOKEN', token);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎟️ Token generated:', {
        token,
        cookies: req.cookies
      });
    }
    
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