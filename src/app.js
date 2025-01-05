// Import dependencies 📦
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http'); // Add http for socket.io
require('dotenv').config();

// Import routes and middleware 🛣️
const authRoutes = require('./routes/auth.routes');
const businessRoutes = require('./routes/business.routes');
const popupRoutes = require('./routes/popup.routes');
const userRoutes = require('./routes/user.routes');
const widgetRoutes = require('./routes/widget.routes');
const voucherRoutes = require('./routes/voucher.routes');
const qrCodeRoutes = require('./routes/qrCode.routes');
const campaignRoutes = require('./routes/campaign.routes');
const { cookieParser, handleCSRFError } = require('./middleware/csrf.middleware');

// Initialize express app 🚀
const app = express();

// Create HTTP server 🌐
const server = http.createServer(app);

// Socket.io setup 🔌
const socketIO = require('socket.io');
const { socketMiddleware, socketErrorHandler } = require('./socket/middleware.socket');
const chatSocketHandler = require('./socket/chat.socket');

// Create socket server
const io = socketIO(server, {
  cors: {
    origin: ['http://localhost:5173','https://qr-lac-alpha.vercel.app','http://127.0.0.1:5500'], // Match your CORS settings
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware 🛠️
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS configuration 🌐
app.use(cors({
  origin: ['http://localhost:5173','https://qr-lac-alpha.vercel.app','http://127.0.0.1:5500'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-XSRF-TOKEN',
    'X-CSRF-Token',
    'CSRF-Token'
  ],
  exposedHeaders: ['X-XSRF-TOKEN', 'X-CSRF-Token', 'CSRF-Token']
}));

// Security headers 🔒
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
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
app.use('/api/campaigns', campaignRoutes);

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

// Apply socket middleware
io.use(socketMiddleware);

// Handle socket errors
socketErrorHandler(io);

// Handle chat sockets
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.user.userId);
  chatSocketHandler(io, socket);
});

// Export both app and server 📤
module.exports = { app, server };
