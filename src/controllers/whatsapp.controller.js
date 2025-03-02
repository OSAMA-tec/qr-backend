const twilio = require('twilio');
const User = require('../models/user.model');
const BusinessAnalytics = require('../models/businessAnalytics.model');
const { uploadToFirebase } = require('../utils/upload.utils');
require('dotenv').config(); 

// ============ Twilio Client Management ============
// Using main Twilio client with env credentials
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ============ WhatsApp Number Management ============
async function connectWhatsAppNumber(req) {
    try {
        const { whatsappNumber, useSandbox } = req.body;
        
        // Validate WhatsApp number format
        if (!whatsappNumber) {
            throw new Error('WhatsApp number is required');
        }

        // Clean and validate the phone number format
        const cleanNumber = whatsappNumber.replace(/\s+/g, '').replace(/[()-]/g, '');
        if (!/^\+?[1-9]\d{1,14}$/.test(cleanNumber)) {
            throw new Error('Invalid phone number format. Please use international format (e.g., +1234567890)');
        }

        const business = await User.findById(req.user.userId);
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        // Check if number is already connected to another business
        const existingBusiness = await User.findOne({
            'businessProfile.whatsappNumber': cleanNumber,
            _id: { $ne: business._id }
        });

        if (existingBusiness) {
            throw new Error('This WhatsApp number is already connected to another business');
        }

        try {
            console.log(`Attempting to verify WhatsApp number: ${cleanNumber}`);
            
            // First verify the phone number is valid
            const phoneNumber = await client.lookups.v2.phoneNumbers(cleanNumber).fetch();
            if (!phoneNumber.valid) {
                throw new Error('Invalid phone number according to Twilio lookup');
            }

            if (useSandbox) {
                // For sandbox testing
                if (!process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER) {
                    throw new Error('TWILIO_WHATSAPP_SANDBOX_NUMBER not configured in environment variables');
                }

                // No need to verify sandbox numbers
                console.log('Using WhatsApp sandbox mode');
            } else {
                // For production numbers
                // Check if the number exists in available WhatsApp senders
                const whatsappNumbers = await client.messaging.v1.services.list({
                    limit: 20
                });

                let isWhatsAppEnabled = false;
                for (const service of whatsappNumbers) {
                    if (service.friendlyName.includes('WhatsApp')) {
                        const senders = await client.messaging.v1.services(service.sid)
                            .phoneNumbers
                            .list();
                        
                        if (senders.some(sender => sender.phoneNumber === cleanNumber)) {
                            isWhatsAppEnabled = true;
                            break;
                        }
                    }
                }

                if (!isWhatsAppEnabled) {
                    throw new Error(
                        'This number is not enabled for WhatsApp. Please either:\n' +
                        '1. Enable it in your Twilio console first, or\n' +
                        '2. Use sandbox mode for testing (set useSandbox: true)'
                    );
                }
            }

            // Update business profile with WhatsApp number
            business.businessProfile.whatsappNumber = cleanNumber;
            business.businessProfile.useSandbox = useSandbox || false;
            await business.save();

            return {
                success: true,
                message: useSandbox ? 
                    'WhatsApp sandbox number connected successfully' : 
                    'WhatsApp number connected successfully',
                whatsappNumber: cleanNumber,
                mode: useSandbox ? 'sandbox' : 'production'
            };

        } catch (error) {
            console.error('WhatsApp Verification Error:', {
                message: error.message,
                code: error.code,
                status: error.status
            });

            throw new Error(error.message);
        }
    } catch (error) {
        console.error('WhatsApp Connection Error:', {
            message: error.message,
            stack: error.stack
        });

        throw new Error(`Failed to connect WhatsApp number: ${error.message}`);
    }
}

// ============ Message Sending ============
async function sendWhatsAppMessage(req) {
    try {
        const { to, message } = req.body;
        const mediaFile = req.file;

        if (!to || !message) {
            throw new Error('Recipient number and message are required');
        }

        const business = await User.findById(req.user.userId);
        if (!business || !business.businessProfile.whatsappNumber) {
            throw new Error('Business not found or WhatsApp number not connected');
        }

        let mediaUrl = null;
        if (mediaFile) {
            mediaUrl = await uploadToFirebase(mediaFile);
        }

        // Clean the recipient number
        const cleanTo = to.replace(/\s+/g, '').replace(/[()-]/g, '');
        if (!/^\+?[1-9]\d{1,14}$/.test(cleanTo)) {
            throw new Error('Invalid recipient number format. Please use international format (e.g., +1234567890)');
        }

        // Determine the from number based on mode
        let fromNumber;
        if (business.businessProfile.useSandbox) {
            // For testing: Use sandbox
            if (!process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER) {
                throw new Error('TWILIO_WHATSAPP_SANDBOX_NUMBER not configured in environment variables');
            }
            fromNumber = process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER;
            console.log('Using sandbox number for testing:', fromNumber);
        } else {
            // For production: Use business's actual WhatsApp number
            fromNumber = business.businessProfile.whatsappNumber;
            console.log('Using business WhatsApp number:', fromNumber);
        }

        const messageData = {
            from: `whatsapp:${fromNumber}`,
            to: `whatsapp:${cleanTo}`,
            body: message
        };

        if (mediaUrl) {
            messageData.mediaUrl = mediaUrl;
        }

        console.log('Sending WhatsApp message with data:', {
            ...messageData,
            mediaUrl: mediaUrl ? 'Present' : 'Not present'
        });

        const response = await client.messages.create(messageData);

        console.log('Message sent successfully:', {
            sid: response.sid,
            status: response.status,
            errorCode: response.errorCode,
            errorMessage: response.errorMessage
        });

        // Update analytics
        const targetDate = req.body.date ? new Date(req.body.date) : new Date();
        
        const analytics = await BusinessAnalytics.findOneAndUpdate(
            { businessId: business._id },
            {
                $inc: { totalMessagesSent: 1 },
                $push: {
                    messageLogs: {
                        messageSid: response.sid,
                        status: response.status,
                        recipient: cleanTo,
                        timestamp: targetDate,
                        mediaType: mediaFile ? mediaFile.mimetype : null,
                        messageType: mediaFile ? 'media' : 'text',
                        fromNumber: fromNumber
                    }
                }
            },
            { upsert: true, new: true }
        );

        await analytics.updateDailyMessageStats(targetDate);
        await analytics.save();

        return {
            success: true,
            messageSid: response.sid,
            status: response.status,
            from: fromNumber,
            to: cleanTo,
            timestamp: targetDate,
            mode: business.businessProfile.useSandbox ? 'sandbox' : 'production'
        };
    } catch (error) {
        console.error('WhatsApp Message Error:', {
            message: error.message,
            code: error.code,
            status: error.status,
            moreInfo: error.moreInfo
        });
        throw new Error(`Failed to send message: ${error.message}`);
    }
}

// ============ Analytics ============
async function getMessageAnalytics(req) {
    try {
        const { startDate, endDate } = req.query;
        const business = await User.findById(req.user.userId);
        
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        const query = { businessId: business._id };
        
        if (startDate && endDate) {
            query['messageLogs.timestamp'] = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const analytics = await BusinessAnalytics.findOne(query);
        
        if (!analytics) {
            return {
                totalMessages: 0,
                dailyStats: [],
                messageLogs: []
            };
        }

        let dailyStats = analytics.dailyMessageStats;
        let messageLogs = analytics.messageLogs;

        if (startDate && endDate) {
            dailyStats = dailyStats.filter(stat => 
                stat.date >= new Date(startDate) && 
                stat.date <= new Date(endDate)
            );
            
            messageLogs = messageLogs.filter(log => 
                log.timestamp >= new Date(startDate) && 
                log.timestamp <= new Date(endDate)
            );
        }

        return {
            totalMessages: analytics.totalMessagesSent,
            dailyStats,
            messageLogs,
            whatsappNumber: business.businessProfile.whatsappNumber
        };
    } catch (error) {
        throw new Error(`Failed to get analytics: ${error.message}`);
    }
}

// ============ WhatsApp Number Status ============
async function getWhatsAppStatus(req) {
    try {
        const business = await User.findById(req.user.userId);
        if (!business || business.role !== 'business') {
            throw new Error('Business not found or invalid role');
        }

        return {
            success: true,
            whatsappNumber: business.businessProfile.whatsappNumber || null,
            isConnected: !!business.businessProfile.whatsappNumber,
            businessName: business.businessProfile.name || null
        };
    } catch (error) {
        throw new Error(`Failed to get WhatsApp status: ${error.message}`);
    }
}

module.exports = {
    connectWhatsAppNumber,
    sendWhatsAppMessage,
    getMessageAnalytics,
    getWhatsAppStatus
};
