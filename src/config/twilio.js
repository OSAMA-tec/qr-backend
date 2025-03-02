const twilio = require('twilio');
require('dotenv').config();

// Initialize Twilio client with error handling
const initTwilioClient = () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error('Twilio credentials not properly configured');
    }

    return twilio(accountSid, authToken);
};

// Export initialized client
const client = initTwilioClient();
module.exports = client; 