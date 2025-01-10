// Validate widget template 🎯
const validateWidgetTemplate = (req, res, next) => {
  console.log('Validating template with body:', req.body); // Debug log
  console.log('File:', req.file); // Debug log for file

  // Extract form data
  const name = req.body.name?.trim();
  const description = req.body.description?.trim();
  const category = req.body.category?.trim();
  const settings = req.body.settings;

  console.log('Extracted data:', { name, description, category }); // Debug log

  // Required fields validation ✅
  if (!name || !description || !category) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields! Please provide name, description, and category. ❌',
      errors: {
        name: !name ? 'Name is required' : null,
        description: !description ? 'Description is required' : null,
        category: !category ? 'Category is required' : null
      }
    });
  }

  // Name validation 📝
  if (name.length < 3 || name.length > 50) {
    return res.status(400).json({
      success: false,
      message: 'Name must be between 3 and 50 characters! ❌'
    });
  }

  // Description validation 📄
  if (description.length < 10 || description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Description must be between 10 and 500 characters! ❌'
    });
  }

  // Category validation 🏷️
  const validCategories = ['popup', 'banner', 'notification', 'sidebar', 'floating'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: `Invalid category! Must be one of: ${validCategories.join(', ')} ❌`
    });
  }

  // Settings validation 🛠️
  if (settings) {
    try {
      // If settings is a string, parse it
      const settingsObj = typeof settings === 'string' ? JSON.parse(settings) : settings;
      
      // Store parsed settings back in request
      req.body.settings = settingsObj;
    } catch (error) {
      console.error('Settings validation error:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid settings format! Please check your input. ❌'
      });
    }
  }

  next();
}; 