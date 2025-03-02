const mongoose = require('mongoose');

// ============== Schema Definition ==============
const otpSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    otp: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // OTP expires in 5 minutes (300 seconds)
    }
});

// ============== Methods ==============
otpSchema.methods.verifyOTP = async function(inputOTP) {
    return this.otp === inputOTP;
};

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP; 