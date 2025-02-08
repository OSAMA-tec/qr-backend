// Import dependencies 📦
const { JWT } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Load service account credentials from environment variable
const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Initialize JWT client 🔑
const jwtClient = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

// Constants
const MERCHANT_ID = process.env.MERCHANT_ID;
const PROFILE_ID = process.env.PROFILE_ID;

// Create Loyalty Class (Template for Vouchers) 🎫
async function createLoyaltyClass(businessId, businessName, logoUrl) {
  try {
    const classId = `${MERCHANT_ID}.${businessId}_${Date.now()}`;
    const loyaltyClass = {
      id: classId,
      issuerName: businessName,
      programName: "Voucher Rewards",
      programLogo: {
        sourceUri: {
          uri: logoUrl
        },
        contentDescription: {
          defaultValue: {
            language: "en-US",
            value: `${businessName} Voucher`
          }
        }
      },
      reviewStatus: "UNDER_REVIEW",
      countryCode: "US",
      redemptionIssuers: [credentials.client_email]
    };

    const response = await jwtClient.request({
      url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',
      method: 'POST',
      data: loyaltyClass
    });

    return response.data;
  } catch (error) {
    console.error('Error creating loyalty class:', error);
    throw error;
  }
}

// Create Loyalty Object (Individual Voucher) 🎟️
async function createLoyaltyObject(classId, voucher, userId) {
  try {
    const objectId = `${MERCHANT_ID}.${voucher._id}_${Date.now()}`;
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: "ACTIVE",
      accountId: userId,
      accountName: `${voucher.title}`,
      barcode: {
        type: "QR_CODE",
        value: voucher.code,
        alternateText: voucher.code
      },
      textModulesData: [
        {
          header: "Description",
          body: voucher.description
        },
        {
          header: "Discount",
          body: `${voucher.discountType === 'percentage' ? voucher.discountValue + '%' : '$' + voucher.discountValue} off`
        },
        {
          header: "Valid Until",
          body: new Date(voucher.endDate).toLocaleDateString()
        }
      ],
      // Only add QR code image if provided
      ...(voucher.qrCode?.url && {
        heroImage: {
          sourceUri: {
            uri: voucher.qrCode.url
          },
          contentDescription: {
            defaultValue: {
              language: "en-US",
              value: "Voucher QR Code"
            }
          }
        }
      }),
      validTimeInterval: {
        start: {
          date: voucher.startDate
        },
        end: {
          date: voucher.endDate
        }
      }
    };

    const response = await jwtClient.request({
      url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject',
      method: 'POST',
      data: loyaltyObject
    });

    return response.data;
  } catch (error) {
    console.error('Error creating loyalty object:', error);
    throw error;
  }
}

// Generate Google Pay link for the pass 🔗
async function generateGooglePayLink(classId, objectId) {
  try {
    const baseUrl = 'https://pay.google.com/gp/v/save/';
    const payload = {
      loyaltyObjects: [{
        id: objectId,
        classId: classId
      }]
    };

    const token = await jwtClient.signJWT(payload);
    return `${baseUrl}${token}`;
  } catch (error) {
    console.error('Error generating Google Pay link:', error);
    throw error;
  }
}

// Update Loyalty Object Status 🔄
async function updateLoyaltyObject(objectId, status) {
  try {
    const response = await jwtClient.request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
      method: 'GET'
    });

    const loyaltyObject = response.data;
    loyaltyObject.state = status;

    const updateResponse = await jwtClient.request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
      method: 'PUT',
      data: loyaltyObject
    });

    return updateResponse.data;
  } catch (error) {
    console.error('Error updating loyalty object:', error);
    throw error;
  }
}

module.exports = {
  createLoyaltyClass,
  createLoyaltyObject,
  generateGooglePayLink,
  updateLoyaltyObject
}; 