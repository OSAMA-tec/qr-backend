// Import dependencies 📦
const mongoose = require('mongoose');
const { app, server } = require('./app');
require('dotenv').config();

// MongoDB connection 🗄️
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB! 🎉'))
  .catch(err => console.error('MongoDB connection error:', err));

// Start server 🚀
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} 🌟`);
});
