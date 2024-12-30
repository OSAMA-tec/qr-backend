// Import dependencies 📦
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import routes and middleware 🛣️
const authRoutes = require('./routes/auth.routes');
const businessRoutes = require('./routes/business.routes');
const popupRoutes = require('./routes/popup.routes');
const userRoutes = require('./routes/user.routes');
const widgetRoutes = require('./routes/widget.routes');
const voucherRoutes = require('./routes/voucher.routes');
const qrCodeRoutes = require('./routes/qrCode.routes');
const { cookieParser, handleCSRFError } = require('./middleware/csrf.middleware');

// Initialize express app 🚀
const app = express();

// Middleware 🛠️
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Add cookie parser before CSRF

// CORS configuration 🌐
app.use(cors({
  origin: 'https://qr-lac-alpha.vercel.app', // Use environment variable
  credentials: true, // Important for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-XSRF-TOKEN',     // Match frontend header
    'X-CSRF-Token',     // Alternative name
    'CSRF-Token'        // Another alternative
  ],
  exposedHeaders: ['X-XSRF-TOKEN', 'X-CSRF-Token', 'CSRF-Token'] // Expose all possible CSRF headers
}));

// Security headers 🔒
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource sharing
  crossOriginEmbedderPolicy: false // Allow embedding in iframes (for widget)
}));

app.use(morgan('dev'));

// Routes 🛣️
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/popup', popupRoutes);
app.use('/api/user', userRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/qr-codes', qrCodeRoutes);

// Health check route 🏥
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to our API! 🎉' });
});

// CSRF Error handler ⚠️
app.use(handleCSRFError);

// General error handling middleware ⚠️
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong! 😢',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
