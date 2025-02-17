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

    // Create pass instance with proper structure
    const pass = template.createPass({
      serialNumber: `voucher-${voucherCode}-${Date.now()}`,
      description: voucherTitle,
      organizationName: businessName,
      // Remove logoText to prevent duplicate logos
      logoText: '',
      relevantDate: expiryDate,
      expirationDate: new Date(expiryDate).toISOString(),
      sharingProhibited: false,
      voided: false,
      // Clean modern styling
      backgroundColor: 'rgb(25, 25, 35)',      // Keep the dark background
      foregroundColor: 'rgb(255, 255, 255)',   // Pure white text
      labelColor: 'rgb(180, 180, 200)',        // Subtle accent for labels
      // Simplified layout with proper spacing
      coupon: {
        primaryFields: [
          {
            key: 'discount',
            value: discountText,
            textAlignment: 'PKTextAlignmentCenter',
            attributedValue: `<div style='font-family: -apple-system; font-size: 50px; font-weight: bold; letter-spacing: -1px; color: rgb(255, 255, 255); margin-top: 20px;'>${discountText}</div>`
          }
        ],
        // Remove secondary fields to prevent business name duplication
        auxiliaryFields: [],
        backFields: [
          {
            key: 'offer_details',
            label: 'OFFER DETAILS',
            value: voucherTitle,
            attributedValue: `<div style='font-family: -apple-system; font-size: 16px; font-weight: 500;'>${voucherTitle}</div>\n\n${description}`
          },
          {
            key: 'validity',
            label: 'VALID UNTIL',
            value: new Date(expiryDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          },
          {
            key: 'terms',
            label: 'TERMS & CONDITIONS',
            value: `• Minimum Purchase Required: $${minimumPurchase}\n• Maximum Discount Value: $${maximumDiscount}\n• This voucher cannot be combined with other offers\n• Valid only at participating locations`
          },
          {
            key: 'code',
            label: 'VOUCHER CODE',
            value: voucherCode,
            attributedValue: `<div style='font-family: monospace; font-size: 18px; font-weight: bold;'>${voucherCode}</div>`
          }
        ]
      },
      // Use secure QR code data
      barcodes: [{
        message: secureQrCode, // Use the secure QR code data
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: voucherCode
      }]
    });

    try {
      // Process only necessary images - no strip image to prevent duplicates
      const [icon1x, icon2x, logo1x, logo2x] = await Promise.all([
        // Icon for the pass
        processImage(icon || logo, 'icon', '1x', {
          fit: 'contain',
          background: { r: 25, g: 25, b: 35, alpha: 1 },
          padding: 4
        }),
        processImage(icon || logo, 'icon', '2x', {
          fit: 'contain',
          background: { r: 25, g: 25, b: 35, alpha: 1 },
          padding: 4
        }),
        // Logo - positioned at top left
        processImage(logo, 'logo', '1x', {
          fit: 'contain',
          background: { r: 25, g: 25, b: 35, alpha: 0 }, // Transparent background
          padding: 0
        }),
        processImage(logo, 'logo', '2x', {
          fit: 'contain',
          background: { r: 25, g: 25, b: 35, alpha: 0 }, // Transparent background
          padding: 0
        })
      ]);

      // Add images - remove strip image
      if (icon1x) await pass.images.add('icon', icon1x);
      if (icon2x) await pass.images.add('icon', icon2x, '2x');
      if (logo1x) await pass.images.add('logo', logo1x);
      if (logo2x) await pass.images.add('logo', logo2x, '2x');
    } catch (imageError) {
      console.warn('Error processing images:', imageError);
    }

    // Add location if provided with enhanced relevant text
    if (latitude && longitude) {
      pass.locations = [
        {
          latitude,
          longitude,
          relevantText: `Save ${discountText} at ${businessName}!`
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
  longitude
}) => {
  try {
    // Create template
    const template = await createTemplate('generic');

    // Create pass instance
    const pass = template.createPass({
      serialNumber: `business-${Date.now()}`,
      description: `Pass for ${businessName}`,
      organizationName: businessName,
      // Generic pass fields
      generic: {
        primaryFields: [
          {
            key: 'business',
            label: 'BUSINESS',
            value: businessName
          }
        ],
        secondaryFields: [
          {
            key: 'location',
            label: 'LOCATION',
            value: locationName || 'Visit our store'
          }
        ]
      }
    });

    // Add location if provided
    if (latitude && longitude) {
      pass.locations = [
        {
          latitude,
          longitude,
          relevantText: `You're near ${businessName}`
        }
      ];
    }

    // Process and add images
    const [logo1x, logo2x, icon1x, icon2x] = await Promise.all([
      processImage(logo, 'logo', '1x'),
      processImage(logo, 'logo', '2x'),
      processImage(icon || logo, 'icon', '1x'),
      processImage(icon || logo, 'icon', '2x')
    ]);

    // Add images if available
    if (logo1x) {
      await pass.images.add('logo', logo1x);
    }
    if (logo2x) {
      await pass.images.add('logo', logo2x, '2x');
    }

    if (icon1x) {
      await pass.images.add('icon', icon1x);
    }
    if (icon2x) {
      await pass.images.add('icon', icon2x, '2x');
    }

    // Generate and return pass
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