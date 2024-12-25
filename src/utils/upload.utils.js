// Import dependencies 📦
const multer = require('multer');
const { bucket } = require('../config/firebase.config');
const path = require('path');

// Configure multer for memory storage 💾
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type 🖼️
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed! 🖼️'));
  },
});

// Upload to Firebase Storage 🔥
const uploadToFirebase = async (file, userId) => {
  try {
    // Create unique filename
    const timestamp = Date.now();
    const filename = `${userId}_${timestamp}_${file.originalname}`;
    const fileUpload = bucket.file(`profile_pics/${filename}`);

    // Create write stream
    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Handle upload
    return new Promise((resolve, reject) => {
      blobStream.on('error', (error) => {
        reject(error);
      });

      blobStream.on('finish', async () => {
        // Make the file public
        await fileUpload.makePublic();
        
        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/profile_pics/${filename}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  } catch (error) {
    throw new Error(`Failed to upload image! 😢 ${error.message}`);
  }
};

module.exports = {
  upload,
  uploadToFirebase,
}; 