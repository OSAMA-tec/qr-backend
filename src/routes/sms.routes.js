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

// ============== File Import Routes for Phone Numbers ==============

// Import phone numbers from CSV/Excel for bulk SMS
router.post('/import-phone-numbers', authMiddleware, upload.single('phonefile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded! Please select a CSV or Excel file'
            });
        }

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        let phoneNumbers = [];

        // Process CSV file
        if (fileExt === '.csv') {
            const results = [];
            
            // Create a Promise that resolves when CSV parsing is complete
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => {
                        // Look for common column names for phone numbers
                        const phoneNumber = data.phone || data.phoneNumber || data.phone_number || 
                                          data.mobile || data.mobileNumber || data.mobile_number ||
                                          data.contact || data.contactNumber || data.contact_number ||
                                          data.cell || data.cellNumber || data.cell_number;
                        
                        if (phoneNumber) {
                            results.push({
                                phoneNumber: phoneNumber.trim(),
                                name: data.name || data.fullName || data.full_name || data.customerName || data.customer_name || '',
                                email: data.email || data.emailAddress || data.email_address || ''
                            });
                        }
                    })
                    .on('end', () => {
                        resolve(results);
                    })
                    .on('error', (err) => {
                        reject(err);
                    });
            });
            
            phoneNumbers = results;
        } 
        // Process Excel file
        else if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);
            
            phoneNumbers = data.map(row => {
                // Look for common column names for phone numbers
                const phoneNumber = row.phone || row.phoneNumber || row.phone_number || 
                                  row.mobile || row.mobileNumber || row.mobile_number ||
                                  row.contact || row.contactNumber || row.contact_number ||
                                  row.cell || row.cellNumber || row.cell_number;
                
                if (phoneNumber) {
                    return {
                        phoneNumber: String(phoneNumber).trim(),
                        name: row.name || row.fullName || row.full_name || row.customerName || row.customer_name || '',
                        email: row.email || row.emailAddress || row.email_address || ''
                    };
                }
                return null;
            }).filter(item => item !== null);
        }

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

        res.status(200).json({
            success: true,
            message: 'File processed successfully',
            data: {
                validCount: validPhoneNumbers.length,
                invalidCount: invalidPhoneNumbers.length,
                validPhoneNumbers: validPhoneNumbers,
                invalidPhoneNumbers: invalidPhoneNumbers
            }
        });
    } catch (error) {
        console.error('Error processing file:', error);
        
        // Clean up file if it exists
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process file'
        });
    }
});

// Send SMS to imported phone numbers
router.post('/send-to-imported', authMiddleware, async (req, res) => {
    const { phoneNumbers, message, fromNumber, options } = req.body;
    try {
        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid phone numbers array is required'
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Extract just the phone numbers for sending
        const recipients = phoneNumbers.map(entry => entry.phoneNumber);
        
        // Include fromNumber in options if provided
        const smsOptions = {
            ...options,
            fromNumber: fromNumber,
            metadata: {
                ...options?.metadata,
                importSource: 'file-upload'
            }
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

module.exports = router; 