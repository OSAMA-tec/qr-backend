// Import dependencies 📦
const mongoose = require('mongoose');
const app = require('./app');
const { verifyConnection } = require('./utils/email.utils');
require('dotenv').config();

// MongoDB connection 🍃
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB! 🎉'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Verify email service 📧
verifyConnection()
  .then(isConnected => {
    if (!isConnected) {
      console.warn('Email service not connected! Check your credentials 📧');
    }
  });

// Start server 🚀
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
    🚀 Server is running on port ${PORT}
    📱 API Documentation: http://localhost:${PORT}/api-docs
    🔒 Environment: ${process.env.NODE_ENV}
  `);
});
