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

// Common email template wrapper 📧
const getEmailTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MrIntroduction</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8f9fa;">
    <!-- Header -->
    <div style="background-color: #2c3e50; padding: 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">MrIntroduction</h1>
        <p style="color: #ecf0f1; margin: 5px 0 0 0; font-size: 16px;">Your Digital Marketing Partner</p>
    </div>

    <!-- Main Content -->
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff; border-radius: 8px; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        ${content}
    </div>

    <!-- Footer -->
    <div style="max-width: 600px; margin: 20px auto; padding: 20px; text-align: center;">
        <p style="color: #7f8c8d; font-size: 14px; margin-bottom: 10px;">
            © ${new Date().getFullYear()} MrIntroduction. All rights reserved.
        </p>
        <div style="margin-top: 20px;">
            <a href="#" style="color: #7f8c8d; text-decoration: none; margin: 0 10px;">Privacy Policy</a>
            <a href="#" style="color: #7f8c8d; text-decoration: none; margin: 0 10px;">Terms of Service</a>
            <a href="#" style="color: #7f8c8d; text-decoration: none; margin: 0 10px;">Contact Us</a>
        </div>
        <div style="margin-top: 20px;">
            <a href="#" style="margin: 0 10px;"><img src="https://img.icons8.com/color/32/000000/facebook-new.png" alt="Facebook"/></a>
            <a href="#" style="margin: 0 10px;"><img src="https://img.icons8.com/color/32/000000/twitter.png" alt="Twitter"/></a>
            <a href="#" style="margin: 0 10px;"><img src="https://img.icons8.com/color/32/000000/linkedin.png" alt="LinkedIn"/></a>
            <a href="#" style="margin: 0 10px;"><img src="https://img.icons8.com/color/32/000000/instagram-new.png" alt="Instagram"/></a>
        </div>
    </div>
</body>
</html>
`;

// Send verification email 📨
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `https://coupon.mrintroduction.com/api/auth/verify-email/${token}`;
  
  const content = `
    <div style="text-align: center;">
        <img src="https://img.icons8.com/color/96/000000/checked-2.png" alt="Verify Email"/>
        <h2 style="color: #2c3e50; margin: 20px 0;">Welcome to MrIntroduction! 🎉</h2>
        <p style="color: #34495e; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            Thank you for joining MrIntroduction. To start exploring our amazing features, please verify your email address.
        </p>
        <div style="margin: 40px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #3498db; 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 5px;
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                Verify Email Address 📧
            </a>
        </div>
        <p style="color: #7f8c8d; font-size: 14px; margin: 20px 0;">
            Or copy and paste this link in your browser:
        </p>
        <p style="background-color: #f8f9fa; 
                  padding: 15px; 
                  border-radius: 5px; 
                  word-break: break-all;
                  font-size: 14px;
                  color: #34495e;
                  border: 1px solid #e9ecef;">
            ${verificationUrl}
        </p>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <p style="color: #95a5a6; font-size: 14px;">
                If you didn't create an account with MrIntroduction, you can safely ignore this email.
            </p>
        </div>
    </div>
  `;

  const mailOptions = {
    from: `"MrIntroduction" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to MrIntroduction - Verify Your Email ✉️',
    html: getEmailTemplate(content)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully! 📧');
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send password reset email 📧
const sendPasswordResetEmail = async (email, token) => {
  try {
    // Create reset URL with token in params
    const resetUrl = `https://www.mrintroduction.coms/reset-password/${token}`;

    // Email template with updated link
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Reset Your Password 🔐</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          
          <a href="${resetUrl}" class="button">Reset Password</a>
          
          <p>If you didn't request this, you can safely ignore this email.</p>
          
          <p>The reset link will expire in 1 hour for security reasons.</p>
          
          <div class="footer">
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Email configuration
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset Your Password',
      html: emailTemplate
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log('Password reset email sent successfully! 📧');
  } catch (error) {
    console.error('Send password reset email error:', error);
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