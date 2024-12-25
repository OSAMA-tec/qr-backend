// Import dependencies 📦
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import routes and middleware 🛣️
const authRoutes = require('./routes/auth.routes');
const { cookieParser, handleCSRFError } = require('./middleware/csrf.middleware');

// Initialize express app 🚀
const app = express();

// Middleware 🛠️
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Add cookie parser before CSRF
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000', // Allow your frontend domain
  credentials: true // Allow cookies to be sent
}));
app.use(helmet());
app.use(morgan('dev'));

// Routes 🛣️
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to our API! 🎉' });
});

// CSRF Error handler ⚠️
app.use(handleCSRFError);

// General error handling middleware ⚠️
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong! 😢' });
});

module.exports = app;
