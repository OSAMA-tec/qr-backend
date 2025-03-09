// Import dependencies 📦
const fs = require('fs');
const path = require('path');
const { Template } = require('@walletpass/pass-js');
const axios = require('axios');
const sharp = require('sharp');

// Certificate paths 🔐
const CERTS_PATH = path.join(process.cwd(), 'certificates');

// Default image URL for Stripe 🖼️
const DEFAULT_STRIPE_IMAGE = 'https://d2liqplnt17rh6.cloudfront.net/coverImages/saltanatrestaurantcover_25a6baa4-f5a3-450e-9025-d207df31ae59-710.jpeg';

// Image size requirements from Apple docs
const IMAGE_SIZES = {
  icon: { width: 29, height: 29 },
  logo: { width: 160, height: 50 },
  strip: { width: 312, height: 123 },
  thumbnail: { width: 90, height: 90 },
  footer: { width: 286, height: 15 }
};

// Enhanced color scheme for better visual appeal 🎨
const COLORS = {
  background: 'rgb(22, 22, 32)',  // Darker background for strong contrast
  foreground: 'rgb(255, 255, 255)', // Pure white text for maximum visibility
  label: 'rgb(255, 220, 105)',     // Gold/yellow for labels to stand out
  accent: 'rgb(65, 145, 230)',     // Bright blue accent color
  strip: { r: 15, g: 15, b: 25, alpha: 0.85 } // Very dark strip overlay for text clarity
};

// Helper function to fetch image from URL
const fetchImageFromUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.warn('Failed to fetch image:', error.message);
    return null;
  }
};

// Helper function to process and resize image
const processImage = async (imageData, type, density = '1x', options = {}) => {
  try {
    if (!imageData) return null;

    // Get image buffer
    let buffer;
    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:image')) {
        // Handle base64 image data
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (imageData.startsWith('http')) {
        // Handle image URL
        buffer = await fetchImageFromUrl(imageData);
      } else {
        // Try to convert to buffer
        buffer = Buffer.from(imageData);
      }
    } else if (Buffer.isBuffer(imageData)) {
      buffer = imageData;
    }

    if (!buffer) {
      console.warn(`Invalid image data for ${type}`);
      return null;
    }

    // Get target size
    const size = IMAGE_SIZES[type];
    if (!size) {
      console.warn(`Unknown image type: ${type}`);
      return buffer;
    }

    // Calculate size based on density
    const scale = density === '2x' ? 2 : 1;
    const targetWidth = size.width * scale;
    const targetHeight = size.height * scale;

    // Apply special processing for strip images to enhance appearance
    if (type === 'strip') {
      // Enhanced strip image processing for better appearance
      try {
        // Apply a more dramatic effect to make the strip stand out
        const resized = await sharp(buffer)
          .resize(targetWidth, targetHeight, {
            fit: 'cover',
            position: 'center',
            ...options
          })
          // Enhanced image adjustments for more visual impact
          .modulate({
            brightness: 1.08,  // Increased brightness
            saturation: 1.3,   // More color saturation
            hue: 5             // Slight hue shift for warmth
          })
          .gamma(1.2)         // Increased gamma for better contrast
          // Create a stronger dark gradient overlay at the bottom for better text readability
          .composite([{
            input: {
              create: {
                width: targetWidth,
                height: targetHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              }
            },
            raw: {
              width: targetWidth,
              height: targetHeight,
              channels: 4
            },
            tile: false,
            gravity: 'south',
            blend: 'multiply',
            premultiplied: true,
            // Create gradient data - darker at bottom for text visibility
            create: (width, height, channels) => {
              const data = Buffer.alloc(width * height * channels);
              for (let y = 0; y < height; y++) {
                const gradientFactor = Math.min(1, y / (height * 0.6)); // Gradient in bottom 60%
                const alpha = Math.min(200, Math.floor(gradientFactor * 200)); // Alpha up to 0.8
                
                for (let x = 0; x < width; x++) {
                  const idx = (y * width + x) * channels;
                  data[idx] = 0;       // R
                  data[idx + 1] = 0;   // G
                  data[idx + 2] = 0;   // B
                  data[idx + 3] = alpha; // Alpha
                }
              }
              return data;
            }
          }])
          .sharpen({
            sigma: 1.2,      // Sharpen radius
            flat: 1.5,       // Flat areas enhancement
            jagged: 0.8      // Edge enhancement
          })
          .png()
          .toBuffer();

        return resized;
      } catch (gradientError) {
        console.warn('Advanced strip processing failed, falling back to basic:', gradientError);
        
        // Fallback to simpler processing if advanced fails
        const resized = await sharp(buffer)
          .resize(targetWidth, targetHeight, {
            fit: 'cover',
            position: 'center'
          })
          .modulate({ brightness: 1.1, saturation: 1.2 })
          .gamma(1.1)
          .composite([{
            input: {
              create: {
                width: targetWidth,
                height: targetHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0.5 }
              }
            },
            blend: 'overlay'
          }])
          .png()
          .toBuffer();
          
        return resized;
      }
    }

    // Standard image processing for other types
    const resized = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        ...options
      })
      .png()
      .toBuffer();

    return resized;
  } catch (error) {
    console.warn(`Failed to process ${type} image:`, error.message);
    return null;
  }
};

// Helper function to extract certificate content
const extractCertificateContent = (certContent) => {
  const matches = certContent.match(/-----BEGIN CERTIFICATE-----\n([\s\S]*?)\n-----END CERTIFICATE-----/);
  if (!matches || !matches[1]) {
    throw new Error('Invalid certificate format');
  }
  return matches[1].trim();
};

// Helper function to extract private key content
const extractPrivateKey = (keyContent) => {
  const matches = keyContent.match(/-----BEGIN PRIVATE KEY-----\n([\s\S]*?)\n-----END PRIVATE KEY-----/);
  if (!matches || !matches[1]) {
    throw new Error('Invalid private key format');
  }
  return matches[1].trim();
};

// Create template for passes
const createTemplate = async (type) => {
  try {
    // Read certificate files
    const signerCertPath = path.join(CERTS_PATH, 'signerCert.pem');
    const signerKeyPath = path.join(CERTS_PATH, 'signerKey.pem');
    const wwdrPath = path.join(CERTS_PATH, 'wwdr.pem');

    // Verify files exist
    if (!fs.existsSync(signerCertPath) || !fs.existsSync(signerKeyPath) || !fs.existsSync(wwdrPath)) {
      throw new Error('Missing required certificate files');
    }

    // Read certificate files
    const signerCertContent = fs.readFileSync(signerCertPath, 'utf8');
    const signerKeyContent = fs.readFileSync(signerKeyPath, 'utf8');
    const wwdrContent = fs.readFileSync(wwdrPath, 'utf8');

    // Create template instance with WWDR certificate
    const template = new Template(type, {
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
      teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
      backgroundColor: COLORS.background,
      foregroundColor: COLORS.foreground,
      labelColor: COLORS.label,
      formatVersion: 1,
      organizationName: "Mr Introduction",
      // Add web service configuration
      webServiceURL: process.env.WALLET_WEB_SERVICE_URL,
      authenticationToken: process.env.WALLET_AUTH_TOKEN,
      // Add NFC configuration if available
      nfc: process.env.NFC_ENABLED ? {
        message: 'Use this pass at the register',
        encryptionPublicKey: process.env.NFC_PUBLIC_KEY
      } : undefined,
      certificates: {
        wwdr: wwdrContent
      }
    });

    // Set signer certificate and private key
    await template.setCertificate(signerCertContent);
    await template.setPrivateKey(signerKeyContent);

    return template;
  } catch (error) {
    console.error('Error creating template:', error);
    throw new Error('Failed to create pass template: ' + error.message);
  }
};

// Create pass for voucher 🎟️
const createVoucherPass = async ({
  businessName,
  voucherTitle,
  voucherCode,
  expiryDate,
  discountValue,
  discountType,
  discountText,
  description,
  logo,
  icon,
  locationName,
  latitude,
  longitude,
  minimumPurchase,
  maximumDiscount,
  secureQrCode
}) => {
  try {
    // Create template
    const template = await createTemplate('coupon');
    
    // Format discount value based on type with enhanced readability
    const formattedDiscount = discountType === 'percentage' 
      ? `${discountValue}% OFF` 
      : `$${discountValue} OFF`;

    // Create pass instance with enhanced design layout
    const pass = template.createPass({
      serialNumber: `voucher-${voucherCode}-${Date.now()}`,
      description: voucherTitle,
      organizationName: businessName,
      relevantDate: expiryDate,
      expirationDate: new Date(expiryDate).toISOString(),
      sharingProhibited: false,
      voided: false,
      // Enhanced design with better color scheme
      backgroundColor: COLORS.background,
      foregroundColor: COLORS.foreground,
      labelColor: COLORS.label,
      logoText: '',
      associatedStoreIdentifiers: process.env.APP_STORE_ID ? [parseInt(process.env.APP_STORE_ID)] : undefined,
      userInfo: { voucherCode },
      coupon: {
        headerFields: [
          {
            key: 'expiry',
            label: 'VALID UNTIL',
            value: new Date(expiryDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }),
            textAlignment: 'PKTextAlignmentRight'
          }
        ],
        primaryFields: [
          {
            key: 'discount',
            label: '',
            // Clean value without HTML
            value: formattedDiscount,
            textAlignment: 'PKTextAlignmentCenter'
          }
        ],
        secondaryFields: [
          {
            key: 'business',
            label: 'BUSINESS',
            // Clean value without HTML
            value: businessName,
            textAlignment: 'PKTextAlignmentLeft'
          },
          {
            key: 'code',
            label: 'CODE',
            // Clean value without HTML
            value: voucherCode,
            textAlignment: 'PKTextAlignmentRight'
          }
        ],
        // Improved backfields with clean formatting
        backFields: [
          {
            key: 'description',
            label: 'DETAILS',
            value: description || `Save ${discountText} at ${businessName}`
          },
          {
            key: 'terms',
            label: 'TERMS & CONDITIONS',
            value: `• Minimum Purchase: $${minimumPurchase}\n• Maximum Discount: $${maximumDiscount}\n• Not combinable with other offers\n• Valid at participating locations`
          }
        ]
      },
      barcodes: [{
        message: secureQrCode,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: voucherCode,
        width: 120, // Slightly larger QR code for better scanning
        height: 120,
        position: 'footer',
        margin: 0
      }]
    });

    // Process and add images with improved background handling
    try {
      const [logo1x, logo2x, icon1x, icon2x] = await Promise.all([
        processImage(logo, 'logo', '1x', {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }),
        processImage(logo, 'logo', '2x', {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }),
        processImage(icon || logo, 'icon', '1x', {
          fit: 'cover',
          background: COLORS.background
        }),
        processImage(icon || logo, 'icon', '2x', {
          fit: 'cover',
          background: COLORS.background
        })
      ]);

      if (logo1x) await pass.images.add('logo', logo1x);
      if (logo2x) await pass.images.add('logo', logo2x, '2x');
      if (icon1x) await pass.images.add('icon', icon1x);
      if (icon2x) await pass.images.add('icon', icon2x, '2x');
      
      // Always use Stripe image for strip with enhanced processing
      const stripImage = await processImage(DEFAULT_STRIPE_IMAGE, 'strip', '1x', {
        fit: 'cover',
        position: 'center',
        background: COLORS.strip
      });
      
      if (stripImage) {
        await pass.images.add('strip', stripImage);
      }
    } catch (imageError) {
      console.warn('Error processing images:', imageError);
    }

    // Add location with enhanced relevant text
    if (latitude && longitude) {
      pass.locations = [
        {
          latitude,
          longitude,
          relevantText: `${formattedDiscount} at ${businessName}`
        }
      ];
    }

    return await pass.asBuffer();

  } catch (error) {
    console.error('Create voucher pass error:', error);
    throw error;
  }
};

// Create pass for business 🎫
const createBusinessPass = async ({
  businessName,
  logo,
  icon,
  locationName,
  latitude,
  longitude,
  description
}) => {
  try {
    // Create template
    const template = await createTemplate('generic');

    // Create pass instance with enhanced design
    const pass = template.createPass({
      serialNumber: `business-${Date.now()}`,
      description: description || `Pass for ${businessName}`,
      organizationName: businessName,
      backgroundColor: COLORS.background,
      foregroundColor: COLORS.foreground,
      labelColor: COLORS.label,
      associatedStoreIdentifiers: process.env.APP_STORE_ID ? [parseInt(process.env.APP_STORE_ID)] : undefined,
      // Generic pass fields with improved text formatting
      generic: {
        primaryFields: [
          {
            key: 'business',
            label: '',
            // Clean value without HTML
            value: businessName,
            textAlignment: 'PKTextAlignmentCenter'
          }
        ],
        secondaryFields: [
          {
            key: 'location',
            label: 'LOCATION',
            // Clean value without HTML
            value: locationName || 'Visit our store',
            textAlignment: 'PKTextAlignmentCenter'
          }
        ],
        auxiliaryFields: [
          {
            key: 'info',
            label: 'INFO',
            value: description || 'Scan at location for special offers',
            textAlignment: 'PKTextAlignmentCenter'
          }
        ]
      }
    });

    // Add location with enhanced experience
    if (latitude && longitude) {
      pass.locations = [
        {
          latitude,
          longitude,
          relevantText: `Welcome to ${businessName}!`
        }
      ];
    }

    // Process and add images with enhanced visuals
    const [logo1x, logo2x, icon1x, icon2x, strip] = await Promise.all([
      processImage(logo, 'logo', '1x', {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }),
      processImage(logo, 'logo', '2x', {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }),
      processImage(icon || logo, 'icon', '1x', {
        fit: 'cover',
        background: COLORS.background
      }),
      processImage(icon || logo, 'icon', '2x', {
        fit: 'cover',
        background: COLORS.background
      }),
      // Always use the Stripe image for strip with enhanced processing
      processImage(DEFAULT_STRIPE_IMAGE, 'strip', '1x', {
        fit: 'cover',
        position: 'center',
        background: COLORS.strip
      })
    ]);

    // Add images
    if (logo1x) await pass.images.add('logo', logo1x);
    if (logo2x) await pass.images.add('logo', logo2x, '2x');
    if (icon1x) await pass.images.add('icon', icon1x);
    if (icon2x) await pass.images.add('icon', icon2x, '2x');
    if (strip) await pass.images.add('strip', strip);

    return await pass.asBuffer();

  } catch (error) {
    console.error('Create business pass error:', error);
    throw error;
  }
};

module.exports = {
  createBusinessPass,
  createVoucherPass
};