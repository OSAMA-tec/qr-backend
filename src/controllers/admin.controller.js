// Import dependencies 📦
const User = require("../models/user.model");
const Campaign = require("../models/campaign.model");
const Coupon = require("../models/coupon.model");
const Transaction = require("../models/transaction.model");
const BusinessAnalytics = require("../models/businessAnalytics.model");
const mongoose = require("mongoose");

// Get all customers with filters and detailed info 👥
const getAllCustomers = async (req, res) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 10,
      
      // Search filters
      search,
      searchFields = ["email", "firstName", "lastName", "phoneNumber"],
      
      // Date filters
      joinDateStart,
      joinDateEnd,
      lastActiveStart,
      lastActiveEnd,
      
      // Source filters
      businessId,
      campaignId,
      voucherId,
      source, // 'campaign', 'popup', 'qr', 'widget', 'direct'
      
      // Status filters
      isGuest,
      isActive,
      isVerified,
      
      // Activity filters
      hasVouchers,
      hasTransactions,
      
      // Sort
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build base query 🏗️
    const query = {};

    // Add search filter 🔍
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = searchFields.map(field => ({ [field]: searchRegex }));
    }

    // Add date filters 📅
    if (joinDateStart || joinDateEnd) {
      query.createdAt = {};
      if (joinDateStart) query.createdAt.$gte = new Date(joinDateStart);
      if (joinDateEnd) query.createdAt.$lte = new Date(joinDateEnd);
    }

    if (lastActiveStart || lastActiveEnd) {
      query.lastLogin = {};
      if (lastActiveStart) query.lastLogin.$gte = new Date(lastActiveStart);
      if (lastActiveEnd) query.lastLogin.$lte = new Date(lastActiveEnd);
    }

    // Add source filters 🎯
    if (businessId) {
      query.$or = [
        { "voucherClaims.businessId": new mongoose.Types.ObjectId(businessId) },
        { "guestDetails.businessId": new mongoose.Types.ObjectId(businessId) }
      ];
    }

    if (campaignId) {
      query["guestDetails.source.campaignId"] = new mongoose.Types.ObjectId(campaignId);
    }

    if (voucherId) {
      query["voucherClaims.voucherId"] = new mongoose.Types.ObjectId(voucherId);
    }

    if (source) {
      query["guestDetails.source.type"] = source;
    }

    // Add status filters 🏷️
    if (isGuest !== undefined) {
      query.isGuest = isGuest === "true";
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === "true";
    }

    // Add activity filters 📊
    if (hasVouchers !== undefined) {
      if (hasVouchers === "true") {
        query["voucherClaims.0"] = { $exists: true };
      } else {
        query["voucherClaims.0"] = { $exists: false };
      }
    }

    if (hasTransactions !== undefined) {
      if (hasTransactions === "true") {
        query.hasTransactions = true;
      } else {
        query.hasTransactions = false;
      }
    }

    // Calculate pagination 📄
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build aggregation pipeline 📊
    const pipeline = [
      { $match: query },
      
      // Initialize arrays if they don't exist
      {
        $addFields: {
          voucherClaims: { $ifNull: ["$voucherClaims", []] },
          transactions: []
        }
      },
      
      // Lookup voucher details
      {
        $lookup: {
          from: "coupons",
          localField: "voucherClaims.voucherId",
          foreignField: "_id",
          as: "voucherDetails"
        }
      },
      
      // Lookup campaign details
      {
        $lookup: {
          from: "campaigns",
          localField: "guestDetails.source.campaignId",
          foreignField: "_id",
          as: "campaignDetails"
        }
      },
      
      // Lookup business details
      {
        $lookup: {
          from: "users",
          let: { businessIds: ["$guestDetails.businessId", "$voucherClaims.businessId"] },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$businessIds"]
                },
                role: "business"
              }
            },
            {
              $project: {
                _id: 1,
                businessName: "$businessProfile.businessName",
                email: 1,
                phoneNumber: 1
              }
            }
          ],
          as: "businessDetails"
        }
      },
      
      // Lookup transaction details
      {
        $lookup: {
          from: "transactions",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$userId", "$$userId"] }
              }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 5 }
          ],
          as: "recentTransactions"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          totalSpent: { 
            $sum: { 
              $ifNull: ["$recentTransactions.amount", 0] 
            }
          },
          totalTransactions: { 
            $size: { 
              $ifNull: ["$recentTransactions", []] 
            }
          },
          totalVouchers: { 
            $size: { 
              $ifNull: ["$voucherClaims", []] 
            }
          },
          lastActivity: {
            $max: [
              { $ifNull: ["$lastLogin", null] },
              { $max: { $ifNull: ["$recentTransactions.createdAt", null] } },
              { $max: { $ifNull: ["$voucherClaims.claimDate", null] } }
            ]
          }
        }
      },
      
      // Sort results
      {
        $sort: {
          [sortBy]: sortOrder === "asc" ? 1 : -1
        }
      },
      
      // Pagination
      { $skip: skip },
      { $limit: parseInt(limit) },
      
      // Project final fields
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          dateOfBirth: 1,
          isGuest: 1,
          isVerified: 1,
          isActive: 1,
          createdAt: 1,
          lastLogin: 1,
          gdprConsent: 1,
          totalSpent: 1,
          totalTransactions: 1,
          totalVouchers: 1,
          lastActivity: 1,
          voucherClaims: 1,
          voucherDetails: 1,
          guestDetails: 1,
          campaignDetails: 1,
          businessDetails: 1,
          recentTransactions: 1
        }
      }
    ];

    // Execute aggregation
    const [customers, totalCount] = await Promise.all([
      User.aggregate(pipeline),
      User.countDocuments(query)
    ]);

    // Format response
    const formattedCustomers = customers.map(customer => ({
      id: customer._id,
      basicInfo: {
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email || '',
        phoneNumber: customer.phoneNumber || '',
        dateOfBirth: customer.dateOfBirth || null,
        isGuest: customer.isGuest || false,
        isVerified: customer.isVerified || false,
        isActive: customer.isActive || false,
        joinedDate: customer.createdAt,
        lastLogin: customer.lastLogin
      },
      metrics: {
        totalSpent: customer.totalSpent || 0,
        totalTransactions: customer.totalTransactions || 0,
        totalVouchers: customer.totalVouchers || 0,
        lastActivity: customer.lastActivity
      },
      voucherActivity: {
        claims: (customer.voucherClaims || []).map(claim => ({
          id: claim._id,
          voucherId: claim.voucherId,
          businessId: claim.businessId,
          status: claim.status,
          claimDate: claim.claimDate,
          expiryDate: claim.expiryDate,
          redeemedDate: claim.redeemedDate,
          voucherDetails: (customer.voucherDetails || []).find(
            v => v._id.toString() === claim.voucherId.toString()
          ),
          qrCode: claim.qrCode ? {
            url: claim.qrCode.url // Only include URL, ignore base64 data
          } : null
        }))
      },
      source: {
        type: customer.guestDetails?.source?.type || "direct",
        campaign: customer.campaignDetails?.[0] ? {
          id: customer.campaignDetails[0]._id,
          name: customer.campaignDetails[0].name,
          type: customer.campaignDetails[0].type
        } : null,
        business: customer.businessDetails?.[0] ? {
          id: customer.businessDetails[0]._id,
          name: customer.businessDetails[0].businessName,
          email: customer.businessDetails[0].email
        } : null
      },
      recentActivity: {
        transactions: (customer.recentTransactions || []).map(tx => ({
          id: tx._id,
          amount: tx.amount || 0,
          date: tx.createdAt,
          businessId: tx.businessId,
          voucherId: tx.voucherId
        }))
      },
      gdprConsent: customer.gdprConsent || {
        marketing: false,
        analytics: false
      }
    }));

    // Calculate summary statistics with null checks
    const summary = {
      total: totalCount,
      filtered: customers.length,
      metrics: {
        totalSpent: formattedCustomers.reduce((sum, c) => sum + (c.metrics.totalSpent || 0), 0),
        avgSpentPerCustomer: formattedCustomers.length ? 
          formattedCustomers.reduce((sum, c) => sum + (c.metrics.totalSpent || 0), 0) / formattedCustomers.length : 0,
        totalVouchers: formattedCustomers.reduce((sum, c) => sum + (c.metrics.totalVouchers || 0), 0),
        avgVouchersPerCustomer: formattedCustomers.length ?
          formattedCustomers.reduce((sum, c) => sum + (c.metrics.totalVouchers || 0), 0) / formattedCustomers.length : 0
      },
      sources: {
        campaign: formattedCustomers.filter(c => c.source?.type === "campaign").length,
        popup: formattedCustomers.filter(c => c.source?.type === "popup").length,
        qr: formattedCustomers.filter(c => c.source?.type === "qr").length,
        widget: formattedCustomers.filter(c => c.source?.type === "widget").length,
        direct: formattedCustomers.filter(c => c.source?.type === "direct" || !c.source?.type).length
      }
    };

    res.json({
      success: true,
      data: {
        customers: formattedCustomers,
        summary,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit),
          hasMore: page < Math.ceil(totalCount / limit)
        },
        filters: {
          search: search || null,
          dates: {
            joinDate: { start: joinDateStart, end: joinDateEnd },
            lastActive: { start: lastActiveStart, end: lastActiveEnd }
          },
          source: {
            businessId: businessId || null,
            campaignId: campaignId || null,
            voucherId: voucherId || null,
            type: source || null
          },
          status: {
            isGuest: isGuest || null,
            isActive: isActive || null,
            isVerified: isVerified || null
          }
        }
      }
    });

  } catch (error) {
    console.error("Get all customers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get detailed customer info by ID 👤
const getCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Build aggregation pipeline similar to getAllCustomers
    const pipeline = [
      { 
        $match: {
          _id: new mongoose.Types.ObjectId(id)
        }
      },
      
      // Initialize arrays if they don't exist
      {
        $addFields: {
          voucherClaims: { $ifNull: ["$voucherClaims", []] },
          transactions: []
        }
      },
      
      // Lookup voucher details
      {
        $lookup: {
          from: "coupons",
          localField: "voucherClaims.voucherId",
          foreignField: "_id",
          as: "voucherDetails"
        }
      },
      
      // Lookup campaign details
      {
        $lookup: {
          from: "campaigns",
          localField: "guestDetails.source.campaignId",
          foreignField: "_id",
          as: "campaignDetails"
        }
      },
      
      // Lookup business details
      {
        $lookup: {
          from: "users",
          let: { businessIds: ["$guestDetails.businessId", "$voucherClaims.businessId"] },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$businessIds"]
                },
                role: "business"
              }
            },
            {
              $project: {
                _id: 1,
                businessName: "$businessProfile.businessName",
                email: 1,
                phoneNumber: 1
              }
            }
          ],
          as: "businessDetails"
        }
      },
      
      // Lookup transaction details with full history
      {
        $lookup: {
          from: "transactions",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$userId", "$$userId"] }
              }
            },
            { $sort: { createdAt: -1 } }
          ],
          as: "transactions"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          totalSpent: { 
            $sum: { 
              $ifNull: ["$transactions.amount", 0] 
            }
          },
          totalTransactions: { 
            $size: { 
              $ifNull: ["$transactions", []] 
            }
          },
          avgTransactionValue: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$transactions", []] } }, 0] },
              { 
                $divide: [
                  { $sum: { $ifNull: ["$transactions.amount", 0] } }, 
                  { $size: { $ifNull: ["$transactions", []] } }
                ] 
              },
              0
            ]
          },
          totalVouchers: { 
            $size: { 
              $ifNull: ["$voucherClaims", []] 
            }
          },
          activeClaims: {
            $size: {
              $filter: {
                input: { $ifNull: ["$voucherClaims", []] },
                as: "claim",
                cond: { $eq: ["$$claim.status", "claimed"] }
              }
            }
          },
          redeemedClaims: {
            $size: {
              $filter: {
                input: { $ifNull: ["$voucherClaims", []] },
                as: "claim",
                cond: { $eq: ["$$claim.status", "redeemed"] }
              }
            }
          },
          lastActivity: {
            $max: [
              { $ifNull: ["$lastLogin", null] },
              { $max: { $ifNull: ["$transactions.createdAt", null] } },
              { $max: { $ifNull: ["$voucherClaims.claimDate", null] } }
            ]
          }
        }
      }
    ];

    const customer = await User.aggregate(pipeline);

    if (!customer || customer.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found! 🔍"
      });
    }

    const customerData = customer[0];

    // Format response with all fields
    const formattedCustomer = {
      id: customerData._id,
      basicInfo: {
        firstName: customerData.firstName || '',
        lastName: customerData.lastName || '',
        email: customerData.email || '',
        phoneNumber: customerData.phoneNumber || '',
        dateOfBirth: customerData.dateOfBirth || null,
        isGuest: customerData.isGuest || false,
        isVerified: customerData.isVerified || false,
        isActive: customerData.isActive || false,
        createdAt: customerData.createdAt,
        lastLogin: customerData.lastLogin || null,
        gdprConsent: customerData.gdprConsent || {
          marketing: false,
          analytics: false
        }
      },
      metrics: {
        totalSpent: customerData.totalSpent || 0,
        totalTransactions: customerData.totalTransactions || 0,
        avgTransactionValue: customerData.avgTransactionValue || 0,
        totalVouchers: customerData.totalVouchers || 0,
        activeClaims: customerData.activeClaims || 0,
        redeemedClaims: customerData.redeemedClaims || 0,
        lastActivity: customerData.lastActivity || null
      },
      voucherActivity: {
        claims: (customerData.voucherClaims || []).map(claim => ({
          id: claim._id,
          voucherId: claim.voucherId,
          businessId: claim.businessId,
          status: claim.status || 'unknown',
          claimDate: claim.claimDate || null,
          expiryDate: claim.expiryDate || null,
          redeemedDate: claim.redeemedDate || null,
          voucherDetails: (customerData.voucherDetails || []).find(
            v => v._id.toString() === claim.voucherId?.toString()
          ) || null,
          qrCode: claim.qrCode ? {
            url: claim.qrCode.url
          } : null
        }))
      },
      source: {
        type: customerData.guestDetails?.source?.type || "direct",
        campaign: customerData.campaignDetails?.[0] ? {
          id: customerData.campaignDetails[0]._id,
          name: customerData.campaignDetails[0].name || '',
          type: customerData.campaignDetails[0].type || '',
          business: customerData.businessDetails?.find(
            b => b._id.toString() === customerData.campaignDetails[0].businessId?.toString()
          ) || null
        } : null,
        business: customerData.businessDetails?.[0] ? {
          id: customerData.businessDetails[0]._id,
          name: customerData.businessDetails[0].businessName || '',
          email: customerData.businessDetails[0].email || '',
          phoneNumber: customerData.businessDetails[0].phoneNumber || ''
        } : null
      },
      transactionHistory: {
        transactions: (customerData.transactions || []).map(tx => ({
          id: tx._id,
          amount: tx.amount || 0,
          date: tx.createdAt,
          businessId: tx.businessId,
          voucherId: tx.voucherId || null,
          status: tx.status || 'unknown',
          paymentMethod: tx.paymentMethod || 'unknown',
          businessDetails: customerData.businessDetails?.find(
            b => b._id.toString() === tx.businessId?.toString()
          ) || null
        }))
      },
      deviceInfo: customerData.deviceInfo || {},
      metadata: {
        registrationIP: customerData.registrationIP || null,
        lastLoginIP: customerData.lastLoginIP || null,
        browser: customerData.browser || null,
        platform: customerData.platform || null,
        lastActivity: customerData.lastActivity || null
      }
    };

    res.json({
      success: true,
      data: formattedCustomer
    });

  } catch (error) {
    console.error("Get customer details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer details! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerDetails
}; 