const express = require('express');
const router = express.Router();
const { sendSMS, sendBulkSMS, getSMSAnalytics, updateSMSStatus, sendOTP, verifyOTP, registerBusinessPhoneNumber, startPhoneNumberVerification, verifyBusinessPhoneNumber, listBusinessPhoneNumbers, setDefaultPhoneNumber, deleteBusinessPhoneNumber } = require('../controllers/sms.controller');
const authMiddleware = require('../middleware/auth.middleware');
const client = require('../config/twilio');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');

// Configure multer for file uploads 📁
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/phone-lists';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
    fileFilter: function (req, file, cb) {
        // Accept only CSV and Excel files
        const filetypes = /csv|xlsx|xls/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed'));
        }
    }
});

// ============== SMS Routes ==============

// Send SMS (handles both single and bulk)
router.post('/send', authMiddleware, async (req, res) => {
    try {
        const { to, recipients, message, fromNumber } = req.body;
        
        // Validate message content
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message content is required'
            });
        }
        
        // Options are optional - just pass fromNumber if provided
        const smsOptions = {
            fromNumber: fromNumber // Will be automatically determined if not provided
        };
        
        // Handle bulk SMS if recipients array is provided
        if (recipients && Array.isArray(recipients) && recipients.length > 0) {
            const result = await sendBulkSMS(req, recipients, message, smsOptions);
            return res.status(200).json({
                success: true,
                message: 'Bulk SMS processing completed',
                ...result
            });
        }
        
        // Handle single SMS
        if (!to) {
            return res.status(400).json({
                success: false,
                error: 'Recipient phone number is required'
            });
        }
        
        const result = await sendSMS(req, to, message, smsOptions);
        return res.status(200).json({
            success: true,
            message: 'SMS sent successfully',
            ...result
        });
    } catch (error) {
        // Check for specific error types
        if (error.message.includes('not verified') || error.message.includes('does not belong to your business')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'verify_number'
            });
        }
        
        if (error.message.includes('No verified business phone numbers')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'register_and_verify_number'
            });
        }
        
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
            error: error.message,
            nextStep: 'register' // Guide client to re-register if verification fails
        });
    }
});

// Complete phone number verification
router.post('/business-numbers/verify-code', authMiddleware, async (req, res) => {
    try {
        const result = await verifyBusinessPhoneNumber(req);
        res.status(200).json(result);
    } catch (error) {
        // Check if it's an expired code error
        if (error.message.includes('expired')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'request_new_code'
            });
        }
        
        // Check if it's an invalid code error
        if (error.message.includes('Invalid verification code')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'retry_code'
            });
        }
        
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
        res.status(200).json({
            ...result,
            nextStep: 'send_sms' // Guide client to send SMS after setting default
        });
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

// ============== File Import Routes for Phone Numbers ==============

// Import and send SMS using CSV/Excel file
router.post('/bulk-send', authMiddleware, upload.single('phonefile'), async (req, res) => {
    try {
        const { message, fromNumber } = req.body;
        
        // Check if message is provided
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message content is required'
            });
        }
        
        // Check if file is uploaded
        if (!req.file) {
            // If no file, check if phoneNumbers are provided in the request body
            if (req.body.phoneNumbers) {
                try {
                    const phoneNumbers = JSON.parse(req.body.phoneNumbers);
                    if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
                        return res.status(400).json({
                            success: false,
                            error: 'Valid phone numbers array is required'
                        });
                    }
                    
                    // Extract just the phone numbers for sending
                    const recipients = phoneNumbers.map(entry => 
                        typeof entry === 'string' ? entry : entry.phoneNumber
                    );
                    
                    // Simple options object, just include fromNumber if provided
                    const smsOptions = {
                        fromNumber: fromNumber, // Will be automatically determined if not provided
                        metadata: {
                            importSource: 'direct-input'
                        }
                    };
                    
                    const result = await sendBulkSMS(req, recipients, message, smsOptions);
                    return res.status(200).json({
                        success: true,
                        message: 'Bulk SMS processing completed',
                        ...result
                    });
                } catch (parseError) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid phoneNumbers format. Must be a JSON array.'
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded or phone numbers provided'
                });
            }
        }

        // Process the uploaded file
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        
        // Extract phone numbers from file
        const phoneNumbers = await processPhoneNumberFile(filePath, fileExt);
        
        // Clean up - delete the file after processing
        fs.unlinkSync(filePath);

        // Validate phone numbers
        const validPhoneNumbers = [];
        const invalidPhoneNumbers = [];
        
        phoneNumbers.forEach(entry => {
            if (validatePhoneNumber(entry.phoneNumber)) {
                validPhoneNumbers.push(entry);
            } else {
                invalidPhoneNumbers.push(entry);
            }
        });
        
        if (validPhoneNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid phone numbers found in file',
                invalidPhoneNumbers: invalidPhoneNumbers
            });
        }

        // Extract just the phone numbers for sending
        const recipients = validPhoneNumbers.map(entry => entry.phoneNumber);
        
        // Simple options object with metadata
        const smsOptions = {
            fromNumber: fromNumber, // Will be automatically determined if not provided
            metadata: {
                importSource: 'file-upload',
                fileName: req.file.originalname
            }
        };
        
        const result = await sendBulkSMS(req, recipients, message, smsOptions);
        
        res.status(200).json({
            success: true,
            message: 'Bulk SMS processing completed',
            validCount: validPhoneNumbers.length,
            invalidCount: invalidPhoneNumbers.length,
            ...result,
            invalidPhoneNumbers: invalidPhoneNumbers.length > 0 ? invalidPhoneNumbers : undefined
        });
    } catch (error) {
        // Clean up file if it exists
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // Handle specific errors
        if (error.message.includes('not verified') || error.message.includes('does not belong')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'verify_number'
            });
        }
        
        if (error.message.includes('No verified business phone numbers')) {
            return res.status(400).json({
                success: false,
                error: error.message,
                nextStep: 'register_and_verify_number'
            });
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 