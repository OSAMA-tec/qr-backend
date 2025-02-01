// Import dependencies 📦
const User = require('../models/user.model');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt.utils');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email.utils');
const crypto = require('crypto');
const { Subscription } = require('../models/subscription.model');

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
      // Handle guest user conversion
      if (existingUser.isGuest) {
        // Update existing guest user
        existingUser.password = password;
        existingUser.role = role;
        existingUser.isGuest = false;
        existingUser.gdprConsent = existingUser.gdprConsent || {
          marketing: false,
          analytics: true,
          consentDate: new Date()
        };
        
        // Preserve guest details but mark as converted
        existingUser.guestDetails = {
          ...existingUser.guestDetails,
          convertedAt: new Date(),
          originalClaimedFrom: existingUser.guestDetails?.claimedFrom
        };

        // Generate new verification token
        existingUser.verificationToken = generateVerificationToken();
        await existingUser.save();

        // Send verification email
        await sendVerificationEmail(email, existingUser.verificationToken);

        return res.status(200).json({
          success: true,
          message: 'Guest account upgraded! Please verify your email 📧'
        });
      }

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

// Register admin controller 👑
const registerAdmin = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      phoneNumber,
      adminCode 
    } = req.body;

    // Verify admin registration code
    if (adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(403).json({
        success: false,
        message: 'Invalid admin registration code! 🚫'
      });
    }

    // Check if admin exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        { role: 'admin' }  // Only one admin allowed for now
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email ? 
          'Email already registered! 📧' : 
          'Admin account already exists! 👑'
      });
    }

    // Create verification token
    const verificationToken = generateVerificationToken();

    // Create admin user
    const admin = new User({
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      role: 'admin',
      verificationToken,
      isVerified: false,  // Require email verification even for admin
      gdprConsent: {
        marketing: false,
        analytics: true,
        consentDate: new Date()
      }
    });

    await admin.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    // Log admin creation
    console.log(`New admin account created: ${email} 👑`);

    res.status(201).json({
      success: true,
      message: 'Admin registration successful! Please check your email to verify your account 📧',
      data: {
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin registration failed! Please try again later 😢'
    });
  }
};

// Register business controller 🏢
const registerBusiness = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can register businesses! 🚫'
      });
    }

    const {
      email,
      password,
      firstName,
      lastName,
      businessName,
      businessDescription,
      businessCategory,
      phoneNumber,
      businessLocation,
      subscription = { plan: 'basic' } // Default to basic if not provided
    } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !businessName || !businessDescription || !businessCategory) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields! Please check your input 📝'
      });
    }

    // First check if email exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered! 📧'
      });
    }

    // Then check if business name exists (case insensitive)
    const existingBusiness = await User.findOne({
      'businessProfile.businessName': { $regex: new RegExp('^' + businessName + '$', 'i') },
      role: 'business'
    });
    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: 'Business name already exists! 🏢'
      });
    }

    // Create verification token
    const verificationToken = generateVerificationToken();

    // Create business user with proper error handling
    const businessData = {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      role: 'business',
      verificationToken,
      isVerified: false,
      // Direct business fields
      businessName,  // Add at root level for backward compatibility
      businessDescription,
      businessCategory,
      businessLocation,
      // Structured business profile
      businessProfile: {
        businessName,
        description: businessDescription,
        category: businessCategory,
        location: {
          address: businessLocation?.address || '',
          city: businessLocation?.city || '',
          state: businessLocation?.state || '',
          country: businessLocation?.country || '',
          zipCode: businessLocation?.zipCode || '',
          coordinates: {
            lat: businessLocation?.coordinates?.lat || null,
            lng: businessLocation?.coordinates?.lng || null
          }
        },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      gdprConsent: {
        marketing: false,  // Default to false, let business opt-in later
        analytics: true,   // Required for basic functionality
        consentDate: new Date()
      }
    };

    const business = new User(businessData);
    await business.save();

    // Create subscription with proper plan validation
    const validPlans = ['basic', 'premium', 'enterprise'];
    const subscriptionPlan = validPlans.includes(subscription.plan) ? subscription.plan : 'basic';
    
    const subscriptionData = {
      businessId: business._id,
      stripeCustomerId: `temp_${business._id}`,
      stripeSubscriptionId: `temp_${Date.now()}`,
      plan: subscriptionPlan,
      status: 'trialing',
      billing: {
        cycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
        cancelAtPeriodEnd: false
      },
      features: {
        maxVouchers: subscriptionPlan === 'basic' ? 100 : 
                     subscriptionPlan === 'premium' ? 500 : 1000,
        analytics: subscriptionPlan !== 'basic',
        customBranding: subscriptionPlan === 'enterprise',
        priority_support: subscriptionPlan === 'enterprise'
      }
    };

    const businessSubscription = new Subscription(subscriptionData);
    await businessSubscription.save();

    // Send verification email with error handling
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the registration, but log the error
    }

    // Log business creation with more details
    console.log(`New business account created 🏢
      Email: ${email}
      Business Name: ${businessName}
      Category: ${businessCategory}
      Plan: ${subscriptionPlan}
    `);

    // Return success response with business details
    return res.status(201).json({
      success: true,
      message: 'Business registration successful! Please check email to verify account 📧',
      data: {
        id: business._id,
        email: business.email,
        businessName: business.businessProfile?.businessName,
        businessCategory: business.businessProfile?.category,
        subscription: {
          plan: businessSubscription.plan,
          status: businessSubscription.status,
          validUntil: businessSubscription.billing.currentPeriodEnd,
          features: businessSubscription.features
        }
      }
    });
  } catch (error) {
    console.error('Business registration error:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A business with this name or email already exists! 🔄'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input data! Please check your input 📝',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Business registration failed! Please try again later 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const { accessToken, refreshToken } = generateTokens(user._id,user.role);

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
    const tokens = generateTokens(decoded.userId, decoded.role);

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
  registerAdmin,
  registerBusiness,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  logout
}; 