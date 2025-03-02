// src/routes/whatsapp.routes.js
const express = require('express');
const router = express.Router();
const { 
    sendWhatsAppMessage, 
    getMessageAnalytics, 
    connectWhatsAppNumber, 
    getWhatsAppStatus 
} = require('../controllers/whatsapp.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');

// ============ WhatsApp Number Management ============
// Route to connect WhatsApp number
router.post('/connect', authMiddleware, async (req, res) => {
    try {
        const result = await connectWhatsAppNumber(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});

// Route to get WhatsApp status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const result = await getWhatsAppStatus(req);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});

// ============ Message Management ============
// Route to send WhatsApp message
router.post('/send-message', authMiddleware, upload.single('mediaFile'), async (req, res) => {
    try {
        const result = await sendWhatsAppMessage(req);
        res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            ...result
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});

// ============ Analytics Management ============
// Route to get message analytics
router.get('/analytics', authMiddleware, async (req, res) => {
    try {
        const analytics = await getMessageAnalytics(req);
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});

// Route to get today's message analytics
router.get('/analytics/today', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        req.query.startDate = today.toISOString();
        req.query.endDate = new Date().toISOString();
        
        const analytics = await getMessageAnalytics(req);
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            success: false
        });
    }
});

module.exports = router;