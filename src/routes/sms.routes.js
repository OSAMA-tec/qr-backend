const express = require('express');
const router = express.Router();
const { sendSMS, sendBulkSMS, getSMSAnalytics, updateSMSStatus, sendOTP, verifyOTP, registerBusinessPhoneNumber, startPhoneNumberVerification, verifyBusinessPhoneNumber, listBusinessPhoneNumbers, setDefaultPhoneNumber, deleteBusinessPhoneNumber } = require('../controllers/sms.controller');
const authMiddleware = require('../middleware/auth.middleware');
const client = require('../config/twilio');

// ============== SMS Routes ==============

// Send single SMS
router.post('/send', authMiddleware, async (req, res) => {
    const { to, message, fromNumber, options } = req.body;
    try {
        // Include fromNumber in options if provided
        const smsOptions = {
            ...options,
            fromNumber: fromNumber
        };
        
        const result = await sendSMS(req, to, message, smsOptions);
        res.status(200).json({
            success: true,
            message: 'SMS sent successfully',
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send bulk SMS
router.post('/send-bulk', authMiddleware, async (req, res) => {
    const { recipients, message, fromNumber, options } = req.body;
    try {
        // Include fromNumber in options if provided
        const smsOptions = {
            ...options,
            fromNumber: fromNumber
        };
        
        const result = await sendBulkSMS(req, recipients, message, smsOptions);
        res.status(200).json({
            success: true,
            message: 'Bulk SMS processing completed',
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get SMS analytics
router.get('/analytics', authMiddleware, async (req, res) => {
    try {
        const analytics = await getSMSAnalytics(req);
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Webhook for SMS status updates
router.post('/webhook', async (req, res) => {
    try {
        const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
        
        await updateSMSStatus(MessageSid, MessageStatus, {
            code: ErrorCode,
            message: ErrorMessage
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

// Get today's SMS analytics
router.get('/analytics/today', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        req.query.startDate = today.toISOString();
        req.query.endDate = new Date().toISOString();
        
        const analytics = await getSMSAnalytics(req);
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============== OTP Routes ==============
// Send OTP
router.post('/send-otp', authMiddleware, async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        // Validate request
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        // Try to send OTP
        const result = await sendOTP(req, phoneNumber);
        
        // Return success response
        res.status(200).json(result);
    } catch (error) {
        // Log error but don't expose internal details
        console.error('Error in /send-otp route:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send OTP'
        });
    }
});

// Verify OTP
router.post('/verify-otp', authMiddleware, async (req, res) => {
    const { phoneNumber, otp } = req.body;
    try {
        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and OTP are required'
            });
        }

        const result = await verifyOTP(phoneNumber, otp);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check OTP SMS Status
router.get('/check-otp-status/:messageSid', authMiddleware, async (req, res) => {
    try {
        const { messageSid } = req.params;
        
        // Get message status from Twilio
        const message = await client.messages(messageSid).fetch();
        
        res.status(200).json({
            success: true,
            status: message.status,
            to: message.to,
            error: message.errorMessage
        });
    } catch (error) {
        console.error('Error checking SMS status:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check SMS status'
        });
    }
});

// Test SMS delivery (for debugging only - remove in production)
router.post('/test-sms', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        // Send a test message directly via Twilio
        const message = `This is a test message from your app. Time: ${new Date().toISOString()}`;
        
        // Try different sender options
        let messageOptions = {
            to: phoneNumber,
            body: message
        };
        
        // Try with messaging service first
        if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
            messageOptions.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        } 
        // Fallback to direct phone number
        else if (process.env.TWILIO_PHONE_NUMBER) {
            messageOptions.from = process.env.TWILIO_PHONE_NUMBER;
        }
        
        const twilioResponse = await client.messages.create(messageOptions);
        
        res.status(200).json({
            success: true,
            message: 'Test SMS sent',
            sid: twilioResponse.sid,
            status: twilioResponse.status,
            from: twilioResponse.from || messageOptions.messagingServiceSid,
            to: twilioResponse.to
        });
    } catch (error) {
        console.error('Test SMS error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============== Business Phone Number Management Routes ==============

// Register a business phone number
router.post('/business-numbers/register', authMiddleware, async (req, res) => {
    try {
        const result = await registerBusinessPhoneNumber(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start phone number verification
router.post('/business-numbers/:phoneNumberId/verify', authMiddleware, async (req, res) => {
    try {
        const result = await startPhoneNumberVerification(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Complete phone number verification
router.post('/business-numbers/verify-code', authMiddleware, async (req, res) => {
    try {
        const result = await verifyBusinessPhoneNumber(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// List business phone numbers
router.get('/business-numbers', authMiddleware, async (req, res) => {
    try {
        const result = await listBusinessPhoneNumbers(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Set a phone number as default
router.post('/business-numbers/:phoneNumberId/set-default', authMiddleware, async (req, res) => {
    try {
        const result = await setDefaultPhoneNumber(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete a business phone number
router.delete('/business-numbers/:phoneNumberId', authMiddleware, async (req, res) => {
    try {
        const result = await deleteBusinessPhoneNumber(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 