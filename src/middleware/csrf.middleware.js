// Import dependencies 🔒
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Initialize CSRF protection 🛡️
const csrfProtection = csrf({
  cookie: {
    key: 'XSRF-TOKEN',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

// CSRF error handler ⚠️
const handleCSRFError = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // 📝 Log error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error('CSRF Error:', {
      url: req.url,
      method: req.method,
      headers: {
        'x-xsrf-token': req.headers['x-xsrf-token'],
        'csrf-token': req.headers['csrf-token']
      },
      cookies: req.cookies
    });
  }

  res.status(403).json({
    success: false,
    message: 'Invalid CSRF token 🚫',
    details: process.env.NODE_ENV === 'development' ? {
      received: req.headers['x-xsrf-token'] || 'No token found',
      error: err.message
    } : undefined
  });
};

// Generate CSRF token endpoint 🎟️
const generateToken = (req, res, next) => {
  csrfProtection(req, res, () => {
    try {
      // Generate token using csurf
      const token = req.csrfToken();

      // Set token in cookie
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
      });

      // Also set in header
      res.set('X-XSRF-TOKEN', token);

      // Log in development
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
      next(error);
    }
  });
};

// Apply CSRF protection middleware 🔐
const applyCSRF = (req, res, next) => {
  // Skip CSRF for these paths
  const skipPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/csrf-token'
  ];

  if (skipPaths.includes(req.path)) {
    return next();
  }

  return csrfProtection(req, res, next);
};

module.exports = {
  cookieParser,
  csrfProtection: applyCSRF,
  handleCSRFError,
  generateToken
}; 