// Import dependencies 📦
const fs = require('fs');
const path = require('path');
const { Template } = require('@walletpass/pass-js');
const axios = require('axios');
const sharp = require('sharp');

// Certificate paths 🔐
const CERTS_PATH = path.join(process.cwd(), 'certificates');

// Image size requirements from Apple docs
const IMAGE_SIZES = {
  icon: { width: 29, height: 29 },
  logo: { width: 160, height: 50 },
  strip: { width: 312, height: 123 },
  thumbnail: { width: 90, height: 90 },
  footer: { width: 286, height: 15 }
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

    // Resize image
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
      backgroundColor: 'rgb(60, 65, 76)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(255, 255, 255)',
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
    
    // Format discount value based on type
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
      backgroundColor: 'rgb(35, 35, 45)', // Slightly darker for contrast
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(220, 220, 220)', // Brighter labels for better visibility
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
            value: formattedDiscount,
            textAlignment: 'PKTextAlignmentCenter'
          }
        ],
        secondaryFields: [
          {
            key: 'business',
            label: 'BUSINESS',
            value: businessName,
            textAlignment: 'PKTextAlignmentLeft'
          },
          {
            key: 'code',
            label: 'CODE',
            value: voucherCode,
            textAlignment: 'PKTextAlignmentRight'
          }
        ],
        // Removed auxiliaryFields that had "SCAN HERE" text
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
        // More compact QR code
        width: 100,
        height: 100,
        position: 'footer', // Move to footer for better design
        margin: 0
      }]
    });

    // Process and add images with improved background handling
    try {
      const [logo1x, logo2x, icon1x, icon2x] = await Promise.all([
        processImage(logo, 'logo', '1x', {
          fit: 'contain',
          background: { r: 35, g: 35, b: 45, alpha: 0 }
        }),
        processImage(logo, 'logo', '2x', {
          fit: 'contain',
          background: { r: 35, g: 35, b: 45, alpha: 0 }
        }),
        processImage(icon || logo, 'icon', '1x', {
          fit: 'cover', // Better icon filling
          background: { r: 35, g: 35, b: 45, alpha: 1 }
        }),
        processImage(icon || logo, 'icon', '2x', {
          fit: 'cover', // Better icon filling  
          background: { r: 35, g: 35, b: 45, alpha: 1 }
        })
      ]);

      if (logo1x) await pass.images.add('logo', logo1x);
      if (logo2x) await pass.images.add('logo', logo2x, '2x');
      if (icon1x) await pass.images.add('icon', icon1x);
      if (icon2x) await pass.images.add('icon', icon2x, '2x');
      
      // Add strip image if we have a logo to create a more visually appealing pass
      if (logo) {
        const stripImage = await processImage(logo, 'strip', '1x', {
          fit: 'cover',
          position: 'center',
          background: { r: 35, g: 35, b: 45, alpha: 0.2 }
        });
        
        if (stripImage) {
          await pass.images.add('strip', stripImage);
        }
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
      backgroundColor: 'rgb(35, 35, 45)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(220, 220, 220)',
      associatedStoreIdentifiers: process.env.APP_STORE_ID ? [parseInt(process.env.APP_STORE_ID)] : undefined,
      // Generic pass fields
      generic: {
        primaryFields: [
          {
            key: 'business',
            label: '',
            value: businessName,
            textAlignment: 'PKTextAlignmentCenter'
          }
        ],
        secondaryFields: [
          {
            key: 'location',
            label: 'LOCATION',
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
        background: { r: 35, g: 35, b: 45, alpha: 0 }
      }),
      processImage(logo, 'logo', '2x', {
        fit: 'contain',
        background: { r: 35, g: 35, b: 45, alpha: 0 }
      }),
      processImage(icon || logo, 'icon', '1x', {
        fit: 'cover',
        background: { r: 35, g: 35, b: 45, alpha: 1 }
      }),
      processImage(icon || logo, 'icon', '2x', {
        fit: 'cover',
        background: { r: 35, g: 35, b: 45, alpha: 1 }
      }),
      processImage(logo, 'strip', '1x', {
        fit: 'cover',
        position: 'center',
        background: { r: 35, g: 35, b: 45, alpha: 0.2 }
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