// Import dependencies 📦
const nodemailer = require('nodemailer');

// Create Gmail transporter 📧
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send verification email 📨
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;
  
  const mailOptions = {
    from: `"CRM System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email ✉️',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: #2c3e50; text-align: center;">Welcome to our CRM System! 🎉</h1>
        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p style="color: #34495e; font-size: 16px;">Please verify your email address to get started:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #3498db; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 5px;
                      font-weight: bold;">
              Verify Email 📧
            </a>
          </div>
          <p style="color: #7f8c8d; font-size: 14px;">Or copy and paste this link in your browser:</p>
          <p style="background-color: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">
            ${verificationUrl}
          </p>
        </div>
        <p style="color: #95a5a6; font-size: 12px; text-align: center;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully! 📧');
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send password reset email 🔄
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  
  const mailOptions = {
    from: `"CRM System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Password 🔐',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: #2c3e50; text-align: center;">Password Reset Request 🔑</h1>
        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p style="color: #34495e; font-size: 16px;">You requested to reset your password. Click the button below to proceed:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #e74c3c; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 5px;
                      font-weight: bold;">
              Reset Password 🔐
            </a>
          </div>
          <p style="color: #7f8c8d; font-size: 14px;">Or copy and paste this link in your browser:</p>
          <p style="background-color: #eee; padding: 10px; border-radius: 5px; word-break: break-all;">
            ${resetUrl}
          </p>
          <p style="color: #e74c3c; font-weight: bold; margin-top: 20px;">
            This link will expire in 1 hour for security reasons.
          </p>
        </div>
        <p style="color: #95a5a6; font-size: 12px; text-align: center;">
          If you didn't request this password reset, please ignore this email or contact support if you're concerned.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully! 📧');
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Verify transporter connection 🔍
const verifyConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email service is ready! ✅');
    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  verifyConnection
}; 