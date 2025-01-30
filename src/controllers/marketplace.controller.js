// Marketplace Controller 🛍️
const Coupon = require("../models/coupon.model");
const User = require("../models/user.model");
const crypto = require("crypto");
const QRCode = require("qrcode");

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
const claimMarketplaceVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const userId = req.user.userId;

    // Get voucher and user
    const [voucher, user] = await Promise.all([
      Coupon.findOne({
        _id: voucherId,
        marketplace: true,
        isActive: true,
      }),
      User.findById(userId),
    ]);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher not available in marketplace 🚫",
      });
    }

    // Check if already claimed
    const existingClaim = user.voucherClaims.find(
      (claim) =>
        claim.voucherId.equals(voucherId) &&
        claim.businessId.equals(voucher.businessId)
    );

    if (existingClaim) {
      return res.status(400).json({
        success: false,
        message: "Voucher already claimed 🔄",
      });
    }

    // Create claim data
    const claimId = crypto.randomBytes(16).toString("hex");
    const qrData = {
      claimId,
      voucherId: voucher._id,
      code: voucher.code,
      businessId: voucher.businessId,
      userId: user._id,
      type: "claimed_voucher",
      timestamp: new Date(),
      expiryDate: voucher.endDate,
    };

    // Generate security hash 🔒
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(qrData))
      .digest("hex");
    qrData.hash = hash;

    // Generate QR code 📱
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    // Update user claims
    user.voucherClaims.push({
      voucherId: voucher._id,
      businessId: voucher.businessId,
      claimMethod: "marketplace",
      claimDate: new Date(),
      expiryDate: voucher.endDate,
      status: "claimed",
      analytics: {
        clickDate: new Date(),
        viewDate: new Date(),
      },
      qrCodeData: qrData,
    });

    await user.save();
    // Update voucher analytics 📊
    await Coupon.updateOne(
      { _id: voucherId },
      {
        $inc: {
          "analytics.redemptions": 1,
          "analytics.qrCodeGenerations": 1,
          currentUsage: 1,
        },
        $push: {
          qrHistory: {
            userId: user._id,
            generatedAt: new Date(),
            hash: hash,
          },
        },
      }
    );
    res.json({
      success: true,
      data: {
        claimId,
        qrCode,
        voucher: {
          id: voucher._id,
          title: voucher.title,
          expiry: voucher.endDate,
        },
      },
    });
  } catch (error) {
    console.error("Claim marketplace voucher error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to claim voucher 😢",
    });
  }
};

module.exports = {
  getMarketplaceVouchers,
  claimMarketplaceVoucher,
};
