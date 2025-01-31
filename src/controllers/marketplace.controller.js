// Marketplace Controller 🛍️
const Coupon = require("../models/coupon.model");
const User = require("../models/user.model");
const crypto = require("crypto");
const QRCode = require("qrcode");
const mongoose = require("mongoose");
const { detectDevice, getLocationFromIP } = require("../utils/device.utils");
const BusinessAnalytics = require("../models/businessAnalytics.model");

// Add this helper function at the top with other imports
const calculateAge = (birthDate) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust age if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Get all marketplace vouchers 📋
const getMarketplaceVouchers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    const query = {
      marketplace: true,
    //   isActive: true,
    //   startDate: { $lte: new Date() },
    //   endDate: { $gte: new Date() },
    };

    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { code: new RegExp(search, "i") },
      ];
    }

    const [vouchers, total] = await Promise.all([
      Coupon.find(query)
        .populate({
          path: "businessId",
          select: 'businessProfile.businessName businessProfile.description businessProfile.category businessProfile.location picUrl firstName lastName phoneNumber email'
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Coupon.countDocuments(query),
    ]);

    // Process vouchers to format business details
    const processedVouchers = vouchers.map(voucher => {
      const voucherObj = voucher.toObject();
      
      // Format business details
      if (voucherObj.businessId) {
        voucherObj.business = {
          id: voucherObj.businessId._id,
          name: voucherObj.businessId.businessProfile?.businessName || '',
          description: voucherObj.businessId.businessProfile?.description || '',
          category: voucherObj.businessId.businessProfile?.category || '',
          location: voucherObj.businessId.businessProfile?.location || {},
          picUrl: voucherObj.businessId.picUrl || '',
          contactInfo: {
            firstName: voucherObj.businessId.firstName,
            lastName: voucherObj.businessId.lastName,
            phoneNumber: voucherObj.businessId.phoneNumber,
            email: voucherObj.businessId.email
          }
        };
        // Remove the original businessId object
        delete voucherObj.businessId;
      }

      return voucherObj;
    });

    // Track clicks for all returned vouchers
    const voucherIds = processedVouchers.map(v => v._id);
    
    await Coupon.updateMany(
      { _id: { $in: voucherIds } },
      { $inc: { 'analytics.marketplace.clicks': 1 } }
    );

    res.json({
      success: true,
      data: {
        vouchers: processedVouchers,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get marketplace vouchers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch marketplace vouchers 😢",
    });
  }
};

// Claim marketplace voucher and generate QR 🎟️
const submitMarketplaceClaim = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    
    // Store transaction result
    const result = await session.withTransaction(async () => {
      const { voucherId } = req.params;
      const { firstName, lastName, email, phoneNumber, dateOfBirth, password } = req.body;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      // Validate required fields
      if (!firstName || !lastName || !email || !phoneNumber || !dateOfBirth || !password) {
        throw new Error('All fields are required');
      }

      // Get voucher and check existing user
      const [voucher, existingUser] = await Promise.all([
        Coupon.findOne({
          _id: voucherId,
          marketplace: true,
          isActive: true
        }).session(session),
        User.findOne({ email }).session(session)
      ]);

      if (!voucher) {
        throw new Error('Voucher not available');
      }

      // Check if email already registered
      if (existingUser) {
        throw new Error('Email already registered! Please login to claim voucher 📧');
      }

      // Create verification token for email verification
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Create new user with proper password handling
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        dateOfBirth,
        role: 'customer',
        isGuest: true,
        isVerified: true,
        verificationToken,
        guestDetails: {
          claimedFrom: 'marketplace',
          businessId: voucher.businessId
        }
      });

      // Save user
      await user.save({ session });

      // Age demographic calculation
      const age = calculateAge(new Date(dateOfBirth));
      let ageGroup = 'over50';
      if (age < 18) ageGroup = 'under18';
      else if (age <= 25) ageGroup = 'eighteenTo25';
      else if (age <= 35) ageGroup = 'twenty6To35';
      else if (age <= 50) ageGroup = 'thirty6To50';

      // Update voucher analytics
      await Coupon.findOneAndUpdate(
        { _id: voucherId },
        {
          $inc: { 
            'analytics.marketplace.submissions': 1,
            'analytics.marketplace.conversions': 1,
            [`analytics.marketplace.ageDemographics.${ageGroup}`]: 1
          }
        },
        { session }
      );

      // Generate QR data
      const claimId = crypto.randomBytes(16).toString('hex');
      const qrData = {
        claimId,
        voucherId: voucher._id,
        code: voucher.code,
        businessId: voucher.businessId,
        userId: user._id,
        type: 'claimed_voucher',
        timestamp: new Date(),
        expiryDate: voucher.endDate
      };

      // Generate security hash
      const hash = crypto.createHash('sha256')
        .update(JSON.stringify(qrData))
        .digest('hex');
      qrData.hash = hash;

      // Generate QR code
      const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

      // Add claim to user
      user.voucherClaims.push({
        voucherId: voucher._id,
        businessId: voucher.businessId,
        claimMethod: 'marketplace',
        claimDate: new Date(),
        expiryDate: voucher.endDate,
        status: 'claimed',
        analytics: {
          clickDate: new Date(),
          viewDate: new Date()
        },
        qrCodeData: qrData
      });

      await user.save({ session });

      // Track device and location
      const deviceInfo = detectDevice(userAgent);
      let location = {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        timezone: 'Unknown'
      };

      try {
        location = await getLocationFromIP(ipAddress);
      } catch (error) {
        console.error('Location detection failed:', error);
        // Continue with default location values
      }
      
      // Update business analytics
      await BusinessAnalytics.findOneAndUpdate(
        { businessId: voucher.businessId },
        {
          $inc: {
            'marketplace.submissions': 1,
            'marketplace.conversions': 1,
            [`demographics.age.${ageGroup}`]: 1
          },
          $set: {
            'marketplace.lastClaim': new Date(),
            'marketplace.lastLocation': location
          }
        },
        { upsert: true, session }
      );

      // Return all the data needed for response
      return {
        user,
        voucher,
        qrCode,
        claimId,
        firstName,
        lastName
      };
    });

    // Now use the result to send response
    if (!result) {
      throw new Error('Transaction failed');
    }

    // Send success response outside transaction using result data
    res.json({
      success: true,
      message: 'Voucher claimed successfully! You can now login with your email and password 🎉',
      data: {
        qrCode: result.qrCode,
        claimDetails: {
          id: result.claimId,
          expiry: result.voucher.endDate,
          user: {
            id: result.user._id,
            name: `${result.firstName} ${result.lastName}`,
            email: result.user.email
          }
        }
      }
    });

  } catch (error) {
    console.error('Marketplace claim error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Claim failed! Please try again 😢'
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

module.exports = {
  getMarketplaceVouchers,
  claimMarketplaceVoucher: submitMarketplaceClaim
};
