// Import dependencies 📦
const {
  createLoyaltyClass,
  createLoyaltyObject,
  generateGooglePayLink,
  updateLoyaltyObject
} = require("../services/googleWallet.service");
const Coupon = require("../models/coupon.model");
const User = require("../models/user.model");

// ============ Google Wallet Pass Generation ============

/**
 * Generate Google Wallet pass for a voucher
 * @route POST /api/wallet/generate-pass
 */
exports.generatePass = async (req, res) => {
  try {
    const { voucherId, qrCode } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!voucherId || !qrCode) {
      return res.status(400).json({
        success: false,
        message: "VoucherId and QR code are required",
      });
    }

    // Get voucher details
    const voucher = await Coupon.findById(voucherId);
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    // Get business details
    const business = await User.findById(voucher.businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    // Create loyalty class for the business if not exists
    const loyaltyClass = await createLoyaltyClass(
      business._id.toString(),
      business.businessProfile.businessName,
      business.picUrl
    );

    // Add QR code to voucher object for pass creation
    const voucherWithQR = {
      ...voucher.toObject(),
      qrCode: {
        data: qrCode,
        url: qrCode,
      },
    };

    // Create loyalty object (individual pass)
    const loyaltyObject = await createLoyaltyObject(
      loyaltyClass.id,
      voucherWithQR,
      userId.toString()
    );

    // Generate Google Pay link
    const googlePayLink = await generateGooglePayLink(
      loyaltyClass.id,
      loyaltyObject.id
    );

    res.status(200).json({
      success: true,
      data: {
        classId: loyaltyClass.id,
        objectId: loyaltyObject.id,
        googlePayLink,
      },
    });
  } catch (error) {
    console.error("Error generating Google Wallet pass:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Google Wallet pass",
      error: error.message,
    });
  }
};

// ============ Pass Management ============

/**
 * Update pass status
 * @route PATCH /api/wallet/pass/:objectId
 */
exports.updatePassStatus = async (req, res) => {
  try {
    const { objectId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ["ACTIVE", "COMPLETED", "EXPIRED", "INACTIVE"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    // Update pass status in Google Wallet
    const updatedPass = await updateLoyaltyObject(objectId, status);

    res.status(200).json({
      success: true,
      message: "Pass status updated successfully",
      data: updatedPass
    });
  } catch (error) {
    console.error("Error updating pass status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update pass status",
      error: error.message,
    });
  }
};
