// src/routes/passTemplate.routes.js
const router = require('express').Router();
const {
  createPassTemplate,
  getAllPassTemplates
} = require('../controllers/passTemplate.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Middleware to validate pass template data
const validatePassTemplate = (req, res, next) => {
  const { templateName, walletConfig } = req.body;

  if (!templateName || !walletConfig || !walletConfig.type) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields! templateName and walletConfig.type are required 😢'
    });
  }

  // Validate walletConfig.type is valid enum value
  if (!['apple', 'android'].includes(walletConfig.type)) {
    return res.status(400).json({
      success: false,
      message: 'walletConfig.type must be either "apple" or "android" 😢'
    });
  }
  
  // Validate content structure if provided
  if (req.body.content) {
    const { content } = req.body;
    
    // Ensure content fields are objects, not strings
    if (content.primaryField && typeof content.primaryField === 'string') {
      try {
        content.primaryField = JSON.parse(content.primaryField);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid primaryField format, must be a valid object! 😢'
        });
      }
    }
    
    // Ensure auxiliaryFields is an array if provided
    if (content.auxiliaryFields) {
      if (typeof content.auxiliaryFields === 'string') {
        try {
          content.auxiliaryFields = JSON.parse(content.auxiliaryFields);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid auxiliaryFields format, must be a valid array! 😢'
          });
        }
      }
      
      if (!Array.isArray(content.auxiliaryFields)) {
        return res.status(400).json({
          success: false,
          message: 'auxiliaryFields must be an array! 😢'
        });
      }
    }
    
    // Ensure extraFields is an array if provided
    if (content.extraFields) {
      if (typeof content.extraFields === 'string') {
        try {
          content.extraFields = JSON.parse(content.extraFields);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid extraFields format, must be a valid array! 😢'
          });
        }
      }
      
      if (!Array.isArray(content.extraFields)) {
        return res.status(400).json({
          success: false,
          message: 'extraFields must be an array! 😢'
        });
      }
    }
  }
  
  // Validate assets if provided
  if (req.body.assets) {
    if (!Array.isArray(req.body.assets)) {
      return res.status(400).json({
        success: false,
        message: 'assets must be an array! 😢'
      });
    }
    
    // Validate each asset has required fields
    for (const asset of req.body.assets) {
      if (!asset.type || !asset.base64) {
        return res.status(400).json({
          success: false,
          message: 'Each asset must have type and base64 fields! 😢'
        });
      }
      
      // Validate asset type
      if (!['logo', 'icon', 'strip'].includes(asset.type)) {
        return res.status(400).json({
          success: false,
          message: 'Asset type must be one of: logo, icon, strip! 😢'
        });
      }
    }
  }

  next();
};

// Routes
router.use(authMiddleware);

// Create new pass template
router.post('/', validatePassTemplate, createPassTemplate);

// Get all pass templates
router.get('/', getAllPassTemplates);

module.exports = router;