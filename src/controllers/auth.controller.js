// Import dependencies 📦
const User = require('../models/user.model');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt.utils');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email.utils');
const crypto = require('crypto');

// Helper function to generate verification token 🎟️
const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

// Verification success HTML template 📄
const getVerificationSuccessHtml = () => `
<!DOCTYPE html>
<html>
<head>
    <title>Email Verification Success</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .success-icon {
            color: #4CAF50;
            font-size: 48px;
            margin-bottom: 20px;
        }
        .title {
            color: #333;
            margin-bottom: 15px;
        }
        .message {
            color: #666;
            margin-bottom: 25px;
        }
        .login-button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            text-decoration: none;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1 class="title">Email Verified Successfully!</h1>
        <p class="message">Your email has been verified. You can now login to your account.</p>
        <a href="${process.env.CLIENT_URL}/login" class="login-button">Go to Login</a>
    </div>
</body>
</html>
`;

// Verification error HTML template 📄
const getVerificationErrorHtml = (message) => `
<!DOCTYPE html>
<html>
<head>
    <title>Email Verification Failed</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .error-icon {
            color: #f44336;
            font-size: 48px;
            margin-bottom: 20px;
        }
        .title {
            color: #333;
            margin-bottom: 15px;
        }
        .message {
            color: #666;
            margin-bottom: 25px;
        }
        .retry-button {
            background-color: #f44336;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            text-decoration: none;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1 class="title">Verification Failed</h1>
        <p class="message">${message}</p>
        <a href="${process.env.CLIENT_URL}/register" class="retry-button">Back to Registration</a>
    </div>
</body>
</html>
`;

// Register controller 📝
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = 'customer' } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered! 📧'
      });
    }

    // Create verification token
    const verificationToken = generateVerificationToken();

    // Create user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      verificationToken
    });

    await user.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account 📧'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed! Please try again later 😢'
    });
  }
};

// Login controller 🔐
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password! 🚫'
      });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password! 🚫'
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email first! ✉️'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Login successful! 🎉',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed! Please try again later 😢'
    });
  }
};

// Refresh token controller 🔄
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token! 🚫'
      });
    }

    // Generate new tokens
    const tokens = generateTokens(decoded.userId);

    res.json({
      success: true,
      message: 'Token refreshed successfully! 🎉',
      data: tokens
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed! Please try again later 😢'
    });
  }
};

// Forgot password controller 🔑
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found! 🔍'
      });
    }

    // Generate reset token
    const resetToken = generateVerificationToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    res.json({
      success: true,
      message: 'Password reset email sent! Please check your inbox 📧'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reset email! Please try again later 😢'
    });
  }
};

// Reset password controller 🔏
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token! 🚫'
      });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful! You can now login with your new password 🎉'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed! Please try again later 😢'
    });
  }
};

// Verify email controller ✉️
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Find user with verification token
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      // Return HTML error page for GET request
      if (req.method === 'GET') {
        return res.send(getVerificationErrorHtml('Invalid or expired verification link.'));
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token! 🚫'
      });
    }

    // Update user verification status
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // Return HTML success page for GET request
    if (req.method === 'GET') {
      return res.send(getVerificationSuccessHtml());
    }

    res.json({
      success: true,
      message: 'Email verified successfully! You can now login 🎉'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    
    // Return HTML error page for GET request
    if (req.method === 'GET') {
      return res.send(getVerificationErrorHtml('Verification failed. Please try again.'));
    }

    res.status(500).json({
      success: false,
      message: 'Email verification failed! Please try again later 😢'
    });
  }
};

// Logout controller 🚪
const logout = async (req, res) => {
  try {
    // In a real application, you might want to blacklist the refresh token
    res.json({
      success: true,
      message: 'Logged out successfully! 👋'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed! Please try again later 😢'
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  logout
}; 