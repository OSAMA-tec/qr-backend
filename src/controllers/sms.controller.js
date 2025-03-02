const User = require('../models/user.model');
const { SMS, BusinessPhoneNumber } = require('../models/sms.model');
const BusinessAnalytics = require('../models/businessAnalytics.model');
const client = require('../config/twilio');
require('dotenv').config();

// ============== Helper Functions ==============
const validatePhoneNumber = (phoneNumber) => {
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
};

// ============== Main Functions ==============

// Send single SMS
async function sendSMS(req, to, message, options = {}) {
    try {
        const business = await User.findById(req.user.userId);
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        if (!validatePhoneNumber(to)) {
            throw new Error('Invalid phone number format');
        }

        // Check if a specific verified phone number was requested
        let fromNumber = options.fromNumber;
        let useBusinessNumber = false;
        let businessPhoneNumber = null;

        // If fromNumber is specified, verify it belongs to the business
        if (fromNumber) {
            businessPhoneNumber = await BusinessPhoneNumber.findOne({
                businessId: business._id,
                phoneNumber: fromNumber,
                isVerified: true,
                status: 'active'
            });
            
            if (!businessPhoneNumber) {
                throw new Error('The specified sending number is not verified or does not belong to your business');
            }
            useBusinessNumber = true;
        } 
        // If no specific number, check if business has a default verified number
        else {
            businessPhoneNumber = await BusinessPhoneNumber.findOne({
                businessId: business._id,
                isVerified: true,
                isDefault: true,
                status: 'active'
            });
            
            if (businessPhoneNumber) {
                fromNumber = businessPhoneNumber.phoneNumber;
                useBusinessNumber = true;
            }
        }

        // Prepare message data - either use business number or messaging service
        let messageData;
        
        if (useBusinessNumber) {
            messageData = {
                from: fromNumber,
                to: to,
                body: message
            };
        } else {
            // Fallback to Messaging Service SID if no verified business number
            messageData = {
                messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                to: to,
                body: message
            };
            
            // Throw error if messaging service SID is not configured
            if (!process.env.TWILIO_MESSAGING_SERVICE_SID) {
                throw new Error('Twilio Messaging Service SID not configured and no verified business numbers available');
            }
        }

        // Send message through Twilio
        const response = await client.messages.create(messageData);

        // Create SMS record with correct enum values
        const sms = new SMS({
            businessId: business._id,
            messageSid: response.sid,
            status: 'queued', // Using valid enum value
            from: response.from || (useBusinessNumber ? fromNumber : process.env.TWILIO_MESSAGING_SERVICE_SID), // Ensure from is set
            to: messageData.to,
            body: message,
            type: options.type === 'otp' ? 'verification' : 'marketing', // Map 'otp' to 'verification'
            campaignId: options.campaignId,
            campaignName: options.campaignName,
            scheduledAt: options.scheduledAt,
            metadata: {
                ...(options.metadata || {}),
                sentViaBusinessNumber: useBusinessNumber ? 'true' : 'false',
                businessPhoneNumberId: useBusinessNumber ? businessPhoneNumber._id.toString() : undefined
            }
        });

        await sms.save();

        // Update business analytics
        await updateBusinessAnalytics(business._id, 'sms');

        return {
            success: true,
            messageSid: response.sid,
            status: response.status,
            details: sms,
            sentViaBusinessNumber: useBusinessNumber
        };

    } catch (error) {
        console.error(`Error sending SMS: ${error.message}`);
        throw error;
    }
}

// Send bulk SMS
async function sendBulkSMS(req, recipients, message, options = {}) {
    try {
        const business = await User.findById(req.user.userId);
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // If fromNumber specified in options, validate it exists and is verified
        if (options.fromNumber) {
            const verifiedNumber = await BusinessPhoneNumber.findOne({
                businessId: business._id,
                phoneNumber: options.fromNumber,
                isVerified: true,
                status: 'active'
            });
            
            if (!verifiedNumber) {
                throw new Error('The specified sending number is not verified or does not belong to your business');
            }
        }

        const results = [];
        const errors = [];

        // Process recipients in batches of 50
        const batchSize = 50;
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            
            const promises = batch.map(async (recipient) => {
                try {
                    if (!validatePhoneNumber(recipient)) {
                        throw new Error(`Invalid phone number format: ${recipient}`);
                    }

                    const result = await sendSMS(req, recipient, message, options);
                    results.push(result);
                } catch (error) {
                    errors.push({
                        recipient,
                        error: error.message
                    });
                }
            });

            await Promise.all(promises);
            
            // Add delay between batches to prevent rate limiting
            if (i + batchSize < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return {
            success: true,
            totalSent: results.length,
            totalFailed: errors.length,
            successfulMessages: results,
            failedMessages: errors
        };

    } catch (error) {
        console.error(`Error in bulk SMS: ${error.message}`);
        throw error;
    }
}

// Get SMS Analytics
async function getSMSAnalytics(req) {
    try {
        const { startDate, endDate } = req.query;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        const query = { businessId: business._id };
        
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const analytics = await SMS.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalClicks: { $sum: '$analytics.clicks' },
                    totalOpens: {
                        $sum: { $cond: ['$analytics.opened', 1, 0] }
                    }
                }
            }
        ]);

        const messagesByDate = await SMS.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        return {
            statusBreakdown: analytics,
            dailyStats: messagesByDate
        };

    } catch (error) {
        console.error(`Error getting SMS analytics: ${error.message}`);
        throw error;
    }
}

// Update SMS Status (Webhook handler)
async function updateSMSStatus(messageSid, newStatus, deliveryDetails = {}) {
    try {
        const sms = await SMS.findOne({ messageSid });
        if (!sms) {
            throw new Error('SMS message not found');
        }

        await sms.updateStatus(newStatus, deliveryDetails);
        return sms;

    } catch (error) {
        console.error(`Error updating SMS status: ${error.message}`);
        throw error;
    }
}

// Helper function to update business analytics
async function updateBusinessAnalytics(businessId, type) {
    try {
        const analytics = await BusinessAnalytics.findOne({ businessId });
        if (!analytics) {
            throw new Error('Business analytics not found');
        }

        if (type === 'sms') {
            analytics.totalMessagesSent += 1;
            await analytics.updateDailyMessageStats(new Date());
        }

        await analytics.save();
    } catch (error) {
        console.error(`Error updating business analytics: ${error.message}`);
    }
}

// ============== OTP Functions ==============
// Generate and send OTP
async function sendOTP(req, to) {
    try {
        // Validate phone number
        if (!validatePhoneNumber(to)) {
            throw new Error('Invalid phone number format. Please include country code (e.g., +1234567890)');
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save OTP in database
        const OTP = require('../models/otp.model');
        
        // Delete any existing OTPs for this number
        await OTP.deleteMany({ phoneNumber: to });
        
        // Create new OTP record
        const newOTP = new OTP({
            phoneNumber: to,
            otp: otp
        });

        // Save OTP to database
        await newOTP.save();

        // Prepare message
        const message = `Your verification code is: ${otp}. Valid for 5 minutes.`;
        
        try {
            // Enhanced Twilio configuration for better delivery
            const messageOptions = {
                to: to,
                body: message
            };
            
            // Use messaging service if available, otherwise use direct phone number
            if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
                messageOptions.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
            } else if (process.env.TWILIO_PHONE_NUMBER) {
                messageOptions.from = process.env.TWILIO_PHONE_NUMBER;
            } else {
                throw new Error('No valid sender configured. Check TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER in .env');
            }
            
            // Send the message
            const twilioResponse = await client.messages.create(messageOptions);

            console.log('Twilio Response:', {
                sid: twilioResponse.sid,
                status: twilioResponse.status,
                to: twilioResponse.to,
                from: twilioResponse.from || messageOptions.messagingServiceSid
            });

            // Create SMS record for tracking
            const sms = new SMS({
                businessId: req.user.userId,
                messageSid: twilioResponse.sid,
                status: 'queued',
                from: twilioResponse.from || messageOptions.messagingServiceSid,
                to: to,
                body: message,
                type: 'verification',
                metadata: {
                    isOTP: 'true',
                    expiresIn: '5 minutes',
                    countryCode: to.substring(0, 3) // Store country code for analytics
                }
            });

            await sms.save();

            // Log success but don't expose OTP
            console.log(`OTP SMS sent successfully to ${to} with SID: ${twilioResponse.sid}`);

            return {
                success: true,
                message: 'OTP sent successfully',
                phoneNumber: to,
                expiresIn: '5 minutes',
                messageSid: twilioResponse.sid,
                // Add note for international numbers
                note: to.startsWith('+92') ? 
                    'International SMS delivery may be delayed. If not received, please check your phone settings or try again.' : 
                    undefined
            };
        } catch (twilioError) {
            // If Twilio fails, delete the OTP record
            await OTP.deleteOne({ phoneNumber: to, otp: otp });
            console.error('Twilio Error:', twilioError);
            throw new Error(`Failed to send SMS: ${twilioError.message}`);
        }
    } catch (error) {
        console.error(`Error in sendOTP: ${error.message}`);
        throw error;
    }
}

// Verify OTP
async function verifyOTP(phoneNumber, inputOTP) {
    try {
        const OTP = require('../models/otp.model');
        const otpRecord = await OTP.findOne({ 
            phoneNumber,
            isVerified: false
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            throw new Error('OTP not found or expired');
        }

        const isValid = await otpRecord.verifyOTP(inputOTP);
        if (!isValid) {
            throw new Error('Invalid OTP');
        }

        // Mark OTP as verified
        otpRecord.isVerified = true;
        await otpRecord.save();

        return {
            success: true,
            message: 'OTP verified successfully',
            phoneNumber
        };
    } catch (error) {
        console.error(`Error verifying OTP: ${error.message}`);
        throw error;
    }
}

// ============== Business Phone Number Management ==============

// Register a business phone number
async function registerBusinessPhoneNumber(req) {
    try {
        const { phoneNumber, makeDefault } = req.body;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Validate phone number format
        if (!validatePhoneNumber(phoneNumber)) {
            throw new Error('Invalid phone number format. Must include country code (e.g., +1234567890)');
        }

        // Check if phone number is already registered by this business
        let existingNumber = await BusinessPhoneNumber.findOne({
            businessId: business._id,
            phoneNumber: phoneNumber
        });

        if (existingNumber) {
            // If number exists but is not verified, allow re-registration
            if (existingNumber.verificationStatus === 'verified') {
                throw new Error('This phone number is already registered to your business');
            } else {
                // Update existing record instead of creating new one
                existingNumber.verificationStatus = 'pending';
                existingNumber.status = 'active';
                existingNumber.verificationDetails = {
                    requestedAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
                    attempts: 0
                };
                await existingNumber.save();
                
                // If makeDefault is true, set as default
                if (makeDefault) {
                    await existingNumber.setAsDefault();
                }
                
                return {
                    success: true,
                    message: 'Phone number registration renewed',
                    phoneNumber: existingNumber
                };
            }
        }

        // Create new phone number record
        const businessPhoneNumber = new BusinessPhoneNumber({
            businessId: business._id,
            phoneNumber: phoneNumber,
            isVerified: false,
            verificationStatus: 'pending',
            verificationDetails: {
                requestedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
                attempts: 0
            },
            isDefault: makeDefault || false,
            complianceStatus: 'not_started'
        });

        // If makeDefault is true, unset any existing default
        if (makeDefault) {
            await BusinessPhoneNumber.updateMany(
                { businessId: business._id, isDefault: true },
                { isDefault: false }
            );
            businessPhoneNumber.isDefault = true;
        }

        await businessPhoneNumber.save();

        return {
            success: true,
            message: 'Phone number registered successfully',
            phoneNumber: businessPhoneNumber
        };

    } catch (error) {
        console.error(`Error registering business phone number: ${error.message}`);
        throw error;
    }
}

// Start phone number verification
async function startPhoneNumberVerification(req) {
    try {
        const { phoneNumberId } = req.params;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Find the phone number
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found or does not belong to your business');
        }

        if (phoneNumber.verificationStatus === 'verified') {
            return {
                success: true,
                message: 'Phone number is already verified',
                phoneNumber
            };
        }

        // Check if too many verification attempts
        if (phoneNumber.verificationDetails.attempts >= 5) {
            phoneNumber.verificationStatus = 'failed';
            await phoneNumber.save();
            throw new Error('Too many verification attempts. Please register the number again.');
        }

        try {
            // Create a verification service
            const verificationService = client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID);
            
            // Set up verification options
            const verificationOptions = {
                to: phoneNumber.phoneNumber,
                channel: 'sms'
            };
            
            // Add template if available
            if (process.env.TWILIO_VERIFY_TEMPLATE_SID) {
                verificationOptions.templateSid = process.env.TWILIO_VERIFY_TEMPLATE_SID;
            }
            
            // Start verification
            const verification = await verificationService.verifications.create(verificationOptions);
            console.log(verification)
            // Update phone number verification details
            phoneNumber.verificationStatus = 'pending';
            phoneNumber.verificationDetails.verificationSid = verification.sid;
            phoneNumber.verificationDetails.requestedAt = new Date();
            phoneNumber.verificationDetails.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            phoneNumber.verificationDetails.attempts += 1;
            phoneNumber.verificationDetails.lastAttemptAt = new Date();
            
            await phoneNumber.save();

            return {
                success: true,
                message: 'Verification code sent successfully',
                expiresIn: '10 minutes',
                phoneNumber: phoneNumber.phoneNumber
            };
        } catch (twilioError) {
            // Handle specific Twilio error codes
            if (twilioError.code === 30038) {
                // OTP Message Body Filtered error
                console.error('Twilio OTP message filtered:', twilioError);
                
                // Update verification details to track the error
                phoneNumber.verificationDetails.attempts += 1;
                phoneNumber.verificationDetails.lastAttemptAt = new Date();
                await phoneNumber.save();
                
                // Try fallback method for verification - using direct SMS instead of Verify API
                if (!process.env.TWILIO_MESSAGING_SERVICE_SID) {
                    throw new Error('Message filtered by carrier. Please contact support to verify your number.');
                }
                
                // Generate manual verification code
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                
                // Store verification code
                phoneNumber.verificationDetails.verificationCode = verificationCode;
                phoneNumber.verificationDetails.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                await phoneNumber.save();
                
                // Send via regular SMS
                const messageContent = `Your phone number verification code is: ${verificationCode}. Valid for 10 minutes.`;
                
                // Multi-level logging to ensure output appears somewhere
                process.stdout.write('\n\n***** EMERGENCY DEBUG *****\n');
                process.stdout.write(`VERIFICATION CODE: ${verificationCode}\n`);
                process.stdout.write(`PHONE NUMBER: ${phoneNumber.phoneNumber}\n`);
                process.stdout.write('*************************\n\n');
                
                console.log('==================================================');
                console.log('FALLBACK VERIFICATION TRIGGERED - ERROR 30038');
                console.log(`VERIFICATION CODE: ${verificationCode}`);
                console.log(`PHONE NUMBER: ${phoneNumber.phoneNumber}`);
                console.log('==================================================');
                
                // Also log to error for good measure (some environments only capture stderr)
                console.error('IMPORTANT: Fallback verification code generated:', verificationCode);
                
                try {
                    // Add additional logging here - right before sending SMS
                    console.log(`ABOUT TO SEND VERIFICATION CODE: ${verificationCode}`);
                    // Log to a file as well for debugging
                    require('fs').appendFileSync('verification_codes.log', 
                        `${new Date().toISOString()} - Phone: ${phoneNumber.phoneNumber}, Code: ${verificationCode}\n`);
                    
                    const smsResponse = await client.messages.create({
                        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                        to: phoneNumber.phoneNumber,
                        body: messageContent
                    });
                    
                    console.log('Fallback SMS sent successfully:', smsResponse.sid);
                    console.log(`Code ${verificationCode} sent to ${phoneNumber.phoneNumber}`);
                    
                    // Force verification code to be visible in any logs
                    setTimeout(() => {
                        console.log(`DELAYED LOG - VERIFICATION CODE: ${verificationCode}`);
                    }, 100);
                    
                    // Return success with verification code included
                    return {
                        success: true,
                        message: 'Verification code sent using alternative method',
                        expiresIn: '10 minutes',
                        phoneNumber: phoneNumber.phoneNumber,
                        usingFallback: true,
                        verification_code: verificationCode // Always include the code for easier testing
                    };
                } catch (smsError) {
                    console.error('Failed to send fallback verification SMS:', smsError);
                    // Log the verification code again in case of error
                    console.error('VERIFICATION CODE (from error handler):', verificationCode);
                    throw new Error(`Failed to send verification code: ${smsError.message}`);
                }
            } else {
                // For other Twilio errors, rethrow
                throw twilioError;
            }
        }
    } catch (error) {
        console.error(`Error starting phone number verification: ${error.message}`);
        throw error;
    }
}

// Verify phone number with code
async function verifyBusinessPhoneNumber(req) {
    try {
        const { phoneNumberId, verificationCode } = req.body;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Find the phone number
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id,
            verificationStatus: 'pending'
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found, not pending verification, or does not belong to your business');
        }

        // Check if verification has expired
        if (phoneNumber.verificationDetails.expiresAt < new Date()) {
            phoneNumber.verificationStatus = 'expired';
            await phoneNumber.save();
            throw new Error('Verification code has expired. Please request a new one.');
        }

        // Check if we're using the fallback verification (direct SMS)
        if (phoneNumber.verificationDetails.verificationCode) {
            // Direct comparison with stored code
            if (phoneNumber.verificationDetails.verificationCode === verificationCode) {
                // Update phone number as verified
                phoneNumber.isVerified = true;
                phoneNumber.verificationStatus = 'verified';
                phoneNumber.verificationDetails.completedAt = new Date();
                // Clear the verification code for security
                phoneNumber.verificationDetails.verificationCode = undefined;
                await phoneNumber.save();

                return {
                    success: true,
                    message: 'Phone number verified successfully',
                    phoneNumber: phoneNumber
                };
            } else {
                // Increment attempts
                phoneNumber.verificationDetails.attempts += 1;
                phoneNumber.verificationDetails.lastAttemptAt = new Date();
                
                // Mark as failed if too many attempts
                if (phoneNumber.verificationDetails.attempts >= 5) {
                    phoneNumber.verificationStatus = 'failed';
                }
                
                await phoneNumber.save();
                
                throw new Error('Invalid verification code');
            }
        } else {
            // Use Twilio Verify API for verification
            try {
                const verificationService = client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID);
                const verification = await verificationService.verificationChecks.create({
                    to: phoneNumber.phoneNumber,
                    code: verificationCode
                });

                if (verification.status === 'approved') {
                    // Update phone number as verified
                    phoneNumber.isVerified = true;
                    phoneNumber.verificationStatus = 'verified';
                    phoneNumber.verificationDetails.completedAt = new Date();
                    await phoneNumber.save();

                    return {
                        success: true,
                        message: 'Phone number verified successfully',
                        phoneNumber: phoneNumber
                    };
                } else {
                    // Increment attempts
                    phoneNumber.verificationDetails.attempts += 1;
                    phoneNumber.verificationDetails.lastAttemptAt = new Date();
                    
                    // Mark as failed if too many attempts
                    if (phoneNumber.verificationDetails.attempts >= 5) {
                        phoneNumber.verificationStatus = 'failed';
                    }
                    
                    await phoneNumber.save();
                    
                    throw new Error('Invalid verification code');
                }
            } catch (twilioError) {
                console.error('Twilio verification error:', twilioError);
                
                // Update attempts
                phoneNumber.verificationDetails.attempts += 1;
                phoneNumber.verificationDetails.lastAttemptAt = new Date();
                await phoneNumber.save();
                
                throw new Error(`Verification failed: ${twilioError.message}`);
            }
        }
    } catch (error) {
        console.error(`Error verifying business phone number: ${error.message}`);
        throw error;
    }
}

// List all business phone numbers
async function listBusinessPhoneNumbers(req) {
    try {
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        const phoneNumbers = await BusinessPhoneNumber.find({
            businessId: business._id
        }).sort({ isDefault: -1, createdAt: -1 });

        return {
            success: true,
            data: phoneNumbers
        };

    } catch (error) {
        console.error(`Error listing business phone numbers: ${error.message}`);
        throw error;
    }
}

// Set a phone number as default
async function setDefaultPhoneNumber(req) {
    try {
        const { phoneNumberId } = req.params;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Find the phone number
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found or does not belong to your business');
        }

        if (!phoneNumber.isVerified) {
            throw new Error('Phone number must be verified before setting as default');
        }

        // Set as default
        await phoneNumber.setAsDefault();

        return {
            success: true,
            message: 'Phone number set as default successfully',
            phoneNumber
        };

    } catch (error) {
        console.error(`Error setting default phone number: ${error.message}`);
        throw error;
    }
}

// Delete a business phone number
async function deleteBusinessPhoneNumber(req) {
    try {
        const { phoneNumberId } = req.params;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Find the phone number
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found or does not belong to your business');
        }

        // Check if this is the default number
        if (phoneNumber.isDefault) {
            // Find another verified number to set as default
            const anotherVerifiedNumber = await BusinessPhoneNumber.findOne({
                businessId: business._id,
                isVerified: true,
                _id: { $ne: phoneNumberId }
            });
            
            if (anotherVerifiedNumber) {
                await anotherVerifiedNumber.setAsDefault();
            }
        }

        // Delete the phone number
        await phoneNumber.remove();

        return {
            success: true,
            message: 'Phone number deleted successfully'
        };

    } catch (error) {
        console.error(`Error deleting business phone number: ${error.message}`);
        throw error;
    }
}

module.exports = {
    sendSMS,
    sendBulkSMS,
    getSMSAnalytics,
    updateSMSStatus,
    sendOTP,
    verifyOTP,
    // Business phone number management
    registerBusinessPhoneNumber,
    startPhoneNumberVerification,
    verifyBusinessPhoneNumber,
    listBusinessPhoneNumbers,
    setDefaultPhoneNumber,
    deleteBusinessPhoneNumber
}; 