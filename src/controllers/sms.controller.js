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

        // Determine from number - either use provided number or find from business's verified numbers
        let fromNumber = options.fromNumber;
        let useBusinessNumber = false;
        let businessPhoneNumber = null;

        // If fromNumber is explicitly specified, verify it belongs to the business
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
        // Otherwise, try to find the business's default verified number
        else {
            // First try to find the default verified number
            businessPhoneNumber = await BusinessPhoneNumber.findOne({
                businessId: business._id,
                isVerified: true,
                isDefault: true,
                status: 'active'
            });
            
            // If no default, try any verified number
            if (!businessPhoneNumber) {
                businessPhoneNumber = await BusinessPhoneNumber.findOne({
                    businessId: business._id,
                    isVerified: true,
                    status: 'active'
                });
            }
            
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
                throw new Error('No verified business phone numbers found and no Twilio Messaging Service SID configured');
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
            type: options.type || 'marketing', // Default to marketing if not specified
            campaignId: options.campaignId, // Optional field
            campaignName: options.campaignName, // Optional field
            scheduledAt: options.scheduledAt, // Optional field
            metadata: options.metadata || {} // Default to empty object if not provided
        });

        await sms.save();

        // Update business analytics
        try {
            await updateBusinessAnalytics(business._id, 'sms_sent');
        } catch (analyticsError) {
            // Log but don't fail if analytics update fails
            console.error(`Analytics update error: ${analyticsError.message}`);
        }

        return {
            success: true,
            message: 'SMS sent successfully',
            messageSid: response.sid,
            status: response.status,
            from: useBusinessNumber ? fromNumber : 'Messaging Service',
            to: to
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

            // Create SMS record for tracking if this was sent within authenticated context
            if (req.user && req.user.userId) {
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
            }

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
                
                // Send verification code
                try {
                    // Generate verification code
                    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                    
                    // Store verification code
                    existingNumber.verificationDetails.verificationCode = verificationCode;
                    existingNumber.verificationDetails.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                    await existingNumber.save();
                    
                    // Send via SMS
                    const messageContent = `Your phone number verification code is: ${verificationCode}. Valid for 10 minutes.`;
                    
                    const smsResponse = await client.messages.create({
                        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                        to: phoneNumber,
                        body: messageContent
                    });
                    
                    return {
                        success: true,
                        message: 'Phone number registration renewed and verification code sent',
                        phoneNumber: existingNumber,
                        phoneNumberId: existingNumber._id,
                        expiresIn: '10 minutes',
                        nextStep: 'verify'
                    };
                } catch (smsError) {
                    console.error('Failed to send verification SMS:', smsError);
                    throw new Error(`Failed to send verification code: ${smsError.message}`);
                }
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
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes for verification
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

        // Send verification code
        try {
            // Generate verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Store verification code
            businessPhoneNumber.verificationDetails.verificationCode = verificationCode;
            await businessPhoneNumber.save();
            
            // Send via SMS
            const messageContent = `Your phone number verification code is: ${verificationCode}. Valid for 10 minutes.`;
            
            if (!process.env.TWILIO_MESSAGING_SERVICE_SID) {
                throw new Error('Twilio Messaging Service SID not configured. Please contact support.');
            }
            
            const smsResponse = await client.messages.create({
                messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                to: phoneNumber,
                body: messageContent
            });
            
            return {
                success: true,
                message: 'Phone number registered and verification code sent',
                phoneNumber: businessPhoneNumber,
                phoneNumberId: businessPhoneNumber._id,
                expiresIn: '10 minutes',
                nextStep: 'verify'
            };
        } catch (smsError) {
            // If SMS fails, delete the phone number record
            await businessPhoneNumber.remove();
            console.error('Failed to send verification SMS:', smsError);
            throw new Error(`Failed to send verification code: ${smsError.message}`);
        }
    } catch (error) {
        console.error(`Error registering business phone number: ${error.message}`);
        throw error;
    }
}

// Verify business phone number with code
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
                phoneNumber: phoneNumber,
                nextStep: 'send_sms'
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
        await phoneNumber.deleteOne();

        return {
            success: true,
            message: 'Phone number deleted successfully'
        };

    } catch (error) {
        console.error(`Error deleting business phone number: ${error.message}`);
        throw error;
    }
}

// Helper function to update business analytics
async function updateBusinessAnalytics(businessId, type) {
    try {
        const analytics = await BusinessAnalytics.findOne({ businessId });
        if (!analytics) {
            // Just log and return if analytics not found, don't throw
            console.log(`Business analytics not found for ID: ${businessId}`);
            return;
        }

        if (type === 'sms' || type === 'sms_sent') {
            analytics.totalMessagesSent = (analytics.totalMessagesSent || 0) + 1;
            
            // Check if updateDailyMessageStats method exists
            if (typeof analytics.updateDailyMessageStats === 'function') {
                await analytics.updateDailyMessageStats(new Date());
            }
        }

        await analytics.save();
    } catch (error) {
        console.error(`Error updating business analytics: ${error.message}`);
        // Don't throw, just log the error
    }
}

// Submit toll-free verification
async function submitTollFreeVerification(req) {
    try {
        const { 
            phoneNumberId, 
            businessProfile, 
            useCase 
        } = req.body;
        
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Validate business profile fields
        if (!businessProfile || !businessProfile.legalEntityName || !businessProfile.websiteUrl) {
            throw new Error('Business name and website URL are required');
        }

        // Validate use case fields 
        if (!useCase || !useCase.description || !useCase.category || !useCase.optInProcess) {
            throw new Error('Use case description, category, and opt-in process are required');
        }

        // Find the toll-free number to verify
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found or does not belong to your business');
        }

        // Check if it's a toll-free number
        if (!/^\+1(8[0-9]{2}|855|866|877|888)/.test(phoneNumber.phoneNumber)) {
            throw new Error('The specified number is not a toll-free number');
        }

        // Check if number is verified first (basic verification)
        if (!phoneNumber.isVerified) {
            throw new Error('Phone number must be verified before submitting toll-free verification');
        }

        // Update phone number with verification details
        phoneNumber.numberType = 'toll-free';
        phoneNumber.tollFreeVerification = {
            status: 'verification_in_progress',
            submittedAt: new Date(),
            updatedAt: new Date(),
            useCase: {
                description: useCase.description,
                category: useCase.category,
                optInProcess: useCase.optInProcess,
                optInExample: useCase.optInExample || ''
            },
            businessProfile: {
                legalEntityName: businessProfile.legalEntityName,
                websiteUrl: businessProfile.websiteUrl,
                businessType: businessProfile.businessType || 'Other'
            }
        };

        // This is where you would integrate with Twilio's API to submit the verification
        // For now, we'll just save the verification details
        
        // In production, you would integrate with the actual Twilio verification API:
        // Example (pseudo-code):
        /*
        const twilioResponse = await client.tollFree.verifications.create({
            PhoneNumberSid: phoneNumber.twilioSid,
            BusinessName: businessProfile.legalEntityName,
            BusinessWebsite: businessProfile.websiteUrl,
            UseCase: useCase.category,
            UseCaseDescription: useCase.description,
            OptInProcessDescription: useCase.optInProcess,
            OptInExample: useCase.optInExample
        });
        
        phoneNumber.tollFreeVerification.submissionId = twilioResponse.sid;
        */

        await phoneNumber.save();

        // In a real scenario, we would need to periodically check the status of the verification
        // That would require a separate worker/cron job

        return {
            success: true,
            message: 'Toll-free verification submitted successfully',
            phoneNumber: phoneNumber,
            status: 'verification_in_progress',
            nextStep: 'wait_for_approval'
        };

    } catch (error) {
        console.error(`Error submitting toll-free verification: ${error.message}`);
        throw error;
    }
}

// Check toll-free verification status
async function checkTollFreeVerificationStatus(req) {
    try {
        const { phoneNumberId } = req.params;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Find the toll-free number
        const phoneNumber = await BusinessPhoneNumber.findOne({
            _id: phoneNumberId,
            businessId: business._id
        });

        if (!phoneNumber) {
            throw new Error('Phone number not found or does not belong to your business');
        }

        if (!phoneNumber.tollFreeVerification) {
            return {
                success: true,
                status: 'not_submitted',
                message: 'Toll-free verification has not been submitted yet',
                phoneNumber: phoneNumber
            };
        }

        // In production, you would check with Twilio API for the current status
        /*
        if (phoneNumber.tollFreeVerification.submissionId) {
            const twilioResponse = await client.tollFree.verifications(phoneNumber.tollFreeVerification.submissionId).fetch();
            
            // Update status based on Twilio response
            phoneNumber.tollFreeVerification.status = twilioResponse.status;
            phoneNumber.tollFreeVerification.updatedAt = new Date();
            
            if (twilioResponse.status === 'rejected') {
                phoneNumber.tollFreeVerification.rejectionReason = twilioResponse.rejectionReason;
            }
            
            await phoneNumber.save();
        }
        */

        return {
            success: true,
            status: phoneNumber.tollFreeVerification.status,
            submittedAt: phoneNumber.tollFreeVerification.submittedAt,
            updatedAt: phoneNumber.tollFreeVerification.updatedAt || phoneNumber.tollFreeVerification.submittedAt,
            rejectionReason: phoneNumber.tollFreeVerification.rejectionReason,
            message: getStatusMessage(phoneNumber.tollFreeVerification.status),
            phoneNumber: {
                _id: phoneNumber._id,
                phoneNumber: phoneNumber.phoneNumber,
                isDefault: phoneNumber.isDefault
            }
        };

    } catch (error) {
        console.error(`Error checking toll-free verification status: ${error.message}`);
        throw error;
    }
}

// Helper function to get status message
function getStatusMessage(status) {
    switch (status) {
        case 'not_verified':
            return 'This toll-free number has not been submitted for verification';
        case 'verification_in_progress':
            return 'Your toll-free verification is in progress. This can take 1-3 business days.';
        case 'approved':
            return 'Your toll-free number has been verified and approved for SMS messaging!';
        case 'rejected':
            return 'Your toll-free verification was rejected. Please see the rejection reason and resubmit with corrected information.';
        case 'resubmission_required':
            return 'Your toll-free verification requires resubmission with updated information.';
        default:
            return 'Unknown verification status';
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
    verifyBusinessPhoneNumber,
    listBusinessPhoneNumbers,
    setDefaultPhoneNumber,
    deleteBusinessPhoneNumber,
    // Toll-free verification
    submitTollFreeVerification,
    checkTollFreeVerificationStatus
}; 