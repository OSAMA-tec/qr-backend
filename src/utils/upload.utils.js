// Import dependencies 📦
const multer = require('multer');
const { bucket } = require('../config/firebase.config');
const path = require('path');

// Configure multer for memory storage 💾
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit for uploads
  },
  fileFilter: (req, file, cb) => {
    // Check file type 🖼️
    const filetypes = /jpeg|jpg|png|gif|mp4|mov|pdf|doc|docx/; 
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image, video, and document files are allowed! 🖼️'));
  },
});

// Upload to Firebase Storage 🔥
const uploadToFirebase = async (file, folder = 'uploads') => {
  try {
    // Create unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.originalname}`;
    const fileUpload = bucket.file(`${folder}/${filename}`);

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
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${folder}/${filename}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    });
  } catch (error) {
    throw new Error(`Failed to upload file! 😢 ${error.message}`);
  }
};

// Upload widget template thumbnail 🎨
const uploadTemplateThumbnail = async (file) => {
  try {
    return await uploadToFirebase(file, 'widget-templates');
  } catch (error) {
    throw new Error(`Failed to upload template thumbnail! 😢 ${error.message}`);
  }
};

module.exports = {
  upload,
  uploadToFirebase,
  uploadTemplateThumbnail
}; 