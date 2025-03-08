// src/controllers/passTemplate.controller.js
const PassTemplate = require('../models/passTemplate.model');

// Create new pass template
const createPassTemplate = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const templateData = { ...req.body };
    
    // Handle assets if present
    // ============
    // Process assets array to update branding structure
    if (templateData.assets && Array.isArray(templateData.assets)) {
      // Initialize branding structure if not present
      if (!templateData.branding) {
        templateData.branding = {};
      }
      
      // Initialize assets structure if not present
      if (!templateData.branding.assets) {
        templateData.branding.assets = {};
      }
      
      // Process each asset and map to corresponding branding fields
      templateData.assets.forEach(asset => {
        if (!asset.type || !asset.base64) return;
        
        // Map asset type to branding structure
        switch (asset.type) {
          case 'logo':
            templateData.branding.assets.logo = {
              url: asset.base64, // Use base64 data directly or process it
              originalFileName: asset.name || 'logo.png',
              format: asset.mimeType || 'image/png'
            };
            break;
          case 'icon':
            templateData.branding.assets.icon = {
              url: asset.base64,
              originalFileName: asset.name || 'icon.png',
              format: asset.mimeType || 'image/png'
            };
            break;
          case 'strip':
            templateData.branding.assets.strip = {
              url: asset.base64,
              originalFileName: asset.name || 'strip.png',
              format: asset.mimeType || 'image/png'
            };
            break;
        }
      });
    }
    
    // Remove assets from templateData as it's not in the model schema
    delete templateData.assets;
    
    // Create new template with processed data
    const passTemplate = new PassTemplate({
      ...templateData,
      businessId
    });

    // Save template
    await passTemplate.save();

    res.status(201).json({
      success: true,
      message: 'Pass template created successfully! 🎉',
      data: passTemplate
    });

  } catch (error) {
    console.error('Error creating pass template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create pass template! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all pass templates
const getAllPassTemplates = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const businessId = req.user.userId;

    // Build query
    const query = { businessId };
    
    if (search) {
      query.templateName = { $regex: search, $options: 'i' };
    }

    if (status) {
      query['metadata.status'] = status;
    }

    // Execute query with pagination
    const templates = await PassTemplate.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Get total count
    const total = await PassTemplate.countDocuments(query);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching pass templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pass templates! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createPassTemplate,
  getAllPassTemplates
};