// Import dependencies 📦
const User = require("../models/user.model");
const Campaign = require("../models/campaign.model");
const Coupon = require("../models/coupon.model");
const Transaction = require("../models/transaction.model");
const BusinessAnalytics = require("../models/businessAnalytics.model");
const { SubscriptionPlan, Subscription } = require("../models/subscription.model");
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

// Get all campaigns with detailed info 🎯
const getAllCampaigns = async (req, res) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 10,
      
      // Search filters
      search,
      searchFields = ["name", "description"],
      
      // Date filters
      startDateFrom,
      startDateTo,
      endDateFrom,
      endDateTo,
      
      // Status filters
      status,
      type,
      businessId,
      
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
    if (startDateFrom || startDateTo) {
      query.startDate = {};
      if (startDateFrom) query.startDate.$gte = new Date(startDateFrom);
      if (startDateTo) query.startDate.$lte = new Date(startDateTo);
    }

    if (endDateFrom || endDateTo) {
      query.endDate = {};
      if (endDateFrom) query.endDate.$gte = new Date(endDateFrom);
      if (endDateTo) query.endDate.$lte = new Date(endDateTo);
    }

    // Add status and type filters
    if (status) query.status = status;
    if (type) query.type = type;
    if (businessId) query.businessId = new mongoose.Types.ObjectId(businessId);

    // Calculate pagination 📄
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build aggregation pipeline 📊
    const pipeline = [
      { $match: query },
      
      // Lookup business details
      {
        $lookup: {
          from: "users",
          localField: "businessId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                businessName: "$businessProfile.businessName",
                email: 1,
                phoneNumber: 1,
                status: "$businessProfile.status",
                category: "$businessProfile.category",
                location: "$businessProfile.location"
              }
            }
          ],
          as: "businessDetails"
        }
      },
      
      // Lookup voucher details
      {
        $lookup: {
          from: "coupons",
          localField: "voucherId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                code: 1,
                type: 1,
                value: 1,
                maxUses: 1,
                currentUses: 1,
                status: 1
              }
            }
          ],
          as: "voucherDetails"
        }
      },
      
      // Lookup campaign leads
      {
        $lookup: {
          from: "campaignleads",
          let: { campaignId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$campaignId", "$$campaignId"] }
              }
            },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],
          as: "leadStats"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          businessInfo: { $arrayElemAt: ["$businessDetails", 0] },
          voucherInfo: { $arrayElemAt: ["$voucherDetails", 0] },
          leadMetrics: {
            total: { 
              $reduce: {
                input: "$leadStats",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.count"] }
              }
            },
            pending: {
              $reduce: {
                input: {
                  $filter: {
                    input: "$leadStats",
                    cond: { $eq: ["$$this._id", "pending"] }
                  }
                },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.count"] }
              }
            },
            converted: {
              $reduce: {
                input: {
                  $filter: {
                    input: "$leadStats",
                    cond: { $eq: ["$$this._id", "converted"] }
                  }
                },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.count"] }
              }
            }
          },
          daysRemaining: {
            $ceil: {
              $divide: [
                { $subtract: ["$endDate", new Date()] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          isActive: {
            $and: [
              { $eq: ["$status", "active"] },
              { $gte: ["$endDate", new Date()] },
              { $lte: ["$startDate", new Date()] }
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
      { $limit: parseInt(limit) }
    ];

    // Execute aggregation
    const [campaigns, totalCount] = await Promise.all([
      Campaign.aggregate(pipeline),
      Campaign.countDocuments(query)
    ]);

    // Format response
    const formattedCampaigns = campaigns.map(campaign => ({
      id: campaign._id,
      basicInfo: {
        name: campaign.name,
        description: campaign.description,
        type: campaign.type,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        daysRemaining: campaign.daysRemaining,
        isActive: campaign.isActive
      },
      business: campaign.businessInfo ? {
        id: campaign.businessInfo._id,
        name: campaign.businessInfo.businessName,
        email: campaign.businessInfo.email,
        phoneNumber: campaign.businessInfo.phoneNumber,
        status: campaign.businessInfo.status,
        category: campaign.businessInfo.category,
        location: campaign.businessInfo.location
      } : null,
      voucher: campaign.voucherInfo ? {
        id: campaign.voucherInfo._id,
        code: campaign.voucherInfo.code,
        type: campaign.voucherInfo.type,
        value: campaign.voucherInfo.value,
        usage: {
          max: campaign.voucherInfo.maxUses,
          current: campaign.voucherInfo.currentUses,
          remaining: campaign.voucherInfo.maxUses - campaign.voucherInfo.currentUses
        }
      } : null,
      metrics: {
        analytics: campaign.analytics || {},
        leads: campaign.leadMetrics,
        budget: campaign.budget || {},
        influencers: (campaign.influencers || []).map(inf => ({
          name: inf.name,
          type: inf.type,
          platform: inf.platform,
          referralCode: inf.referralCode,
          stats: inf.stats
        }))
      },
      targeting: campaign.targeting || {},
      formConfig: campaign.formConfig || {}
    }));

    // Calculate summary statistics
    const summary = {
      total: totalCount,
      filtered: campaigns.length,
      status: {
        active: campaigns.filter(c => c.isActive).length,
        draft: campaigns.filter(c => c.status === 'draft').length,
        completed: campaigns.filter(c => c.status === 'completed').length,
        cancelled: campaigns.filter(c => c.status === 'cancelled').length
      },
      metrics: {
        totalLeads: formattedCampaigns.reduce((sum, c) => sum + (c.metrics.leads.total || 0), 0),
        totalConversions: formattedCampaigns.reduce((sum, c) => sum + (c.metrics.leads.converted || 0), 0),
        totalRevenue: formattedCampaigns.reduce((sum, c) => sum + (c.metrics.analytics.revenue || 0), 0),
        avgConversionRate: formattedCampaigns.length ? 
          formattedCampaigns.reduce((sum, c) => {
            const rate = c.metrics.leads.total ? (c.metrics.leads.converted / c.metrics.leads.total) * 100 : 0;
            return sum + rate;
          }, 0) / formattedCampaigns.length : 0
      }
    };

    res.json({
      success: true,
      data: {
        campaigns: formattedCampaigns,
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
            startDate: { from: startDateFrom, to: startDateTo },
            endDate: { from: endDateFrom, to: endDateTo }
          },
          status: status || null,
          type: type || null,
          businessId: businessId || null
        }
      }
    });

  } catch (error) {
    console.error("Get all campaigns error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get admin dashboard overview stats 📊
const getAdminDashboardStats = async (req, res) => {
  try {
    const [
      totalBusinesses,
      activeBusinesses,
      totalRevenue,
      totalQRScans,
      activeCoupons,
      totalCustomers,
      subscriptionStats
    ] = await Promise.all([
      // Total businesses
      User.countDocuments({ role: 'business' }),
      
      // Active businesses
      User.countDocuments({ 
        role: 'business',
        'businessProfile.status': 'active'
      }),
      
      // Total platform revenue
      Transaction.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ]),
      
      // Total QR scans
      BusinessAnalytics.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$totalQRScans" }
          }
        }
      ]),
      
      // Active coupons
      Coupon.countDocuments({ status: 'active' }),
      
      // Total customers
      User.countDocuments({ role: 'customer' }),
      
      // Subscription stats
      Subscription.aggregate([
        {
          $group: {
            _id: "$plan",
            count: { $sum: 1 },
            revenue: { $sum: "$customAmount.amount" }
          }
        }
      ])
    ]);

    // Format response
    res.json({
      success: true,
      data: {
        overview: {
          totalBusinesses,
          activeBusinesses,
          totalRevenue: totalRevenue[0]?.total || 0,
          totalQRScans: totalQRScans[0]?.total || 0,
          activeCoupons,
          totalCustomers
        },
        subscriptions: {
          plans: subscriptionStats.map(stat => ({
            plan: stat._id,
            count: stat.count,
            revenue: stat.revenue
          })),
          total: subscriptionStats.reduce((sum, stat) => sum + stat.count, 0),
          totalRevenue: subscriptionStats.reduce((sum, stat) => sum + stat.revenue, 0)
        },
        growth: {
          businesses: ((activeBusinesses / totalBusinesses) * 100).toFixed(2),
          revenue: 0, // Calculate based on previous period
          qrScans: 0, // Calculate based on previous period
          customers: 0 // Calculate based on previous period
        }
      }
    });

  } catch (error) {
    console.error("Get admin dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard stats! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get all businesses with filters and analytics 🏢
const getAllBusinesses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      subscriptionPlan,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build query
    const query = { role: 'business' };
    
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { "businessProfile.businessName": searchRegex },
        { email: searchRegex }
      ];
    }
    
    if (category) {
      query["businessProfile.category"] = category;
    }
    
    if (status) {
      query["businessProfile.status"] = status;
    }
    
    if (subscriptionPlan) {
      query["subscription.plan"] = subscriptionPlan;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build aggregation pipeline
    const pipeline = [
      { $match: query },
      
      // Lookup business analytics
      {
        $lookup: {
          from: "businessanalytics",
          localField: "_id",
          foreignField: "businessId",
          as: "analytics"
        }
      },
      
      // Lookup subscription details
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "businessId",
          as: "subscriptionDetails"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          analytics: { $arrayElemAt: ["$analytics", 0] },
          subscriptionInfo: { $arrayElemAt: ["$subscriptionDetails", 0] },
          isActive: { $eq: ["$businessProfile.status", "active"] }
        }
      },
      
      // Sort results
      { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },
      
      // Pagination
      { $skip: skip },
      { $limit: parseInt(limit) }
    ];

    // Execute aggregation
    const [businesses, totalCount] = await Promise.all([
      User.aggregate(pipeline),
      User.countDocuments(query)
    ]);

    // Format response
    const formattedBusinesses = businesses.map(business => ({
      id: business._id,
      businessInfo: {
        name: business.businessProfile?.businessName || '',
        email: business.email,
        category: business.businessProfile?.category || '',
        status: business.businessProfile?.status || 'inactive',
        location: business.businessProfile?.location || {},
        joinedDate: business.createdAt
      },
      subscription: {
        plan: business.subscription?.plan || 'free',
        status: business.subscription?.status || 'inactive',
        revenue: business.subscriptionInfo?.customAmount?.amount || 0,
        currentPeriodEnd: business.subscription?.currentPeriodEnd
      },
      analytics: {
        totalRevenue: business.analytics?.totalRevenue || 0,
        totalCustomers: business.analytics?.totalCustomers || 0,
        totalQRScans: business.analytics?.totalQRScans || 0,
        totalRedemptions: business.analytics?.totalRedemptions || 0
      },
      metrics: {
        activeCoupons: business.analytics?.voucherStats?.activeVouchers || 0,
        totalCoupons: business.analytics?.voucherStats?.totalVouchers || 0,
        conversionRate: business.analytics?.totalRedemptions && business.analytics?.totalQRScans ? 
          ((business.analytics.totalRedemptions / business.analytics.totalQRScans) * 100).toFixed(2) : 0
      }
    }));

    // Calculate summary statistics
    const summary = {
      total: totalCount,
      active: businesses.filter(b => b.isActive).length,
      metrics: {
        totalRevenue: formattedBusinesses.reduce((sum, b) => sum + b.analytics.totalRevenue, 0),
        totalCustomers: formattedBusinesses.reduce((sum, b) => sum + b.analytics.totalCustomers, 0),
        totalQRScans: formattedBusinesses.reduce((sum, b) => sum + b.analytics.totalQRScans, 0),
        avgRevenue: formattedBusinesses.length ? 
          formattedBusinesses.reduce((sum, b) => sum + b.analytics.totalRevenue, 0) / formattedBusinesses.length : 0
      },
      categories: {},
      subscriptions: {}
    };

    // Group by category and subscription plan
    formattedBusinesses.forEach(business => {
      // Category stats
      const category = business.businessInfo.category || 'uncategorized';
      if (!summary.categories[category]) {
        summary.categories[category] = 0;
      }
      summary.categories[category]++;

      // Subscription stats
      const plan = business.subscription.plan;
      if (!summary.subscriptions[plan]) {
        summary.subscriptions[plan] = 0;
      }
      summary.subscriptions[plan]++;
    });

    res.json({
      success: true,
      data: {
        businesses: formattedBusinesses,
        summary,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit),
          hasMore: page < Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    console.error("Get all businesses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch businesses! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get detailed business info and analytics 📈
const getBusinessDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const pipeline = [
      { 
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          role: 'business'
        }
      },
      
      // Lookup business analytics
      {
        $lookup: {
          from: "businessanalytics",
          localField: "_id",
          foreignField: "businessId",
          as: "analytics"
        }
      },
      
      // Lookup subscription details
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "businessId",
          as: "subscriptionDetails"
        }
      },
      
      // Lookup active campaigns
      {
        $lookup: {
          from: "campaigns",
          localField: "_id",
          foreignField: "businessId",
          pipeline: [
            { $match: { status: "active" } },
            { $sort: { createdAt: -1 } },
            { $limit: 5 }
          ],
          as: "activeCampaigns"
        }
      },
      
      // Lookup recent transactions
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "businessId",
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: 10 }
          ],
          as: "recentTransactions"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          analytics: { $arrayElemAt: ["$analytics", 0] },
          subscriptionInfo: { $arrayElemAt: ["$subscriptionDetails", 0] }
        }
      }
    ];

    const business = await User.aggregate(pipeline);

    if (!business || business.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Business not found! 🔍"
      });
    }

    const businessData = business[0];

    // Format response
    const formattedBusiness = {
      id: businessData._id,
      businessInfo: {
        name: businessData.businessProfile?.businessName || '',
        email: businessData.email,
        phoneNumber: businessData.phoneNumber,
        category: businessData.businessProfile?.category || '',
        description: businessData.businessProfile?.description || '',
        status: businessData.businessProfile?.status || 'inactive',
        location: businessData.businessProfile?.location || {},
        logo: businessData.businessProfile?.logo,
        joinedDate: businessData.createdAt,
        lastLogin: businessData.lastLogin
      },
      subscription: {
        plan: businessData.subscription?.plan || 'free',
        status: businessData.subscription?.status || 'inactive',
        revenue: businessData.subscriptionInfo?.customAmount?.amount || 0,
        currentPeriodEnd: businessData.subscription?.currentPeriodEnd,
        features: businessData.subscriptionInfo?.features || {},
        paymentHistory: businessData.subscriptionInfo?.paymentHistory || []
      },
      analytics: {
        overview: {
          totalRevenue: businessData.analytics?.totalRevenue || 0,
          totalCustomers: businessData.analytics?.totalCustomers || 0,
          totalQRScans: businessData.analytics?.totalQRScans || 0,
          totalRedemptions: businessData.analytics?.totalRedemptions || 0
        },
        monthly: businessData.analytics?.monthlyStats || [],
        daily: businessData.analytics?.dailyStats || [],
        devices: businessData.analytics?.deviceStats || {},
        browsers: businessData.analytics?.browserStats || {},
        sources: businessData.analytics?.sourceStats || {}
      },
      vouchers: {
        active: businessData.analytics?.voucherStats?.activeVouchers || 0,
        total: businessData.analytics?.voucherStats?.totalVouchers || 0,
        claims: businessData.analytics?.voucherStats?.totalClaims || 0,
        redemptions: businessData.analytics?.voucherStats?.totalRedemptions || 0
      },
      campaigns: {
        active: businessData.activeCampaigns?.map(campaign => ({
          id: campaign._id,
          name: campaign.name,
          type: campaign.type,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          status: campaign.status,
          metrics: campaign.metrics || {}
        })) || []
      },
      transactions: {
        recent: businessData.recentTransactions?.map(tx => ({
          id: tx._id,
          amount: tx.amount,
          date: tx.createdAt,
          status: tx.status,
          customer: tx.customerId,
          voucher: tx.voucherId
        })) || []
      },
      settings: {
        widget: businessData.businessProfile?.widgetSettings || {},
        terms: businessData.businessProfile?.termsAndConditions || {}
      }
    };

    res.json({
      success: true,
      data: formattedBusiness
    });

  } catch (error) {
    console.error("Get business details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch business details! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get business analytics 📊
const getBusinessAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const analytics = await BusinessAnalytics.findOne({ businessId: id });
    
    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: "Business analytics not found! 🔍"
      });
    }

    // Filter stats by date range if provided
    let monthlyStats = analytics.monthlyStats || [];
    let dailyStats = analytics.dailyStats || [];

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      monthlyStats = monthlyStats.filter(stat => {
        const statDate = new Date(stat.year, stat.month - 1);
        return statDate >= start && statDate <= end;
      });

      dailyStats = dailyStats.filter(stat => {
        const statDate = new Date(stat.date);
        return statDate >= start && statDate <= end;
      });
    }

    res.json({
      success: true,
      data: {
        overview: {
          totalRevenue: analytics.totalRevenue || 0,
          totalCustomers: analytics.totalCustomers || 0,
          totalQRScans: analytics.totalQRScans || 0,
          totalRedemptions: analytics.totalRedemptions || 0
        },
        trends: {
          monthly: monthlyStats,
          daily: dailyStats
        },
        customers: {
          total: analytics.customerStats?.total || 0,
          active: analytics.customerStats?.active || 0,
          guest: analytics.customerStats?.guest || 0,
          registered: analytics.customerStats?.registered || 0
        },
        devices: analytics.deviceStats || {},
        browsers: analytics.browserStats || {},
        sources: analytics.sourceStats || {},
        vouchers: analytics.voucherStats || {}
      }
    });

  } catch (error) {
    console.error("Get business analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch business analytics! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Get subscription statistics 💳
const getSubscriptionStats = async (req, res) => {
  try {
    const [
      subscriptionStats,
      revenueByPlan,
      activeSubscriptions,
      subscriptionTrends
    ] = await Promise.all([
      // Subscription plan distribution
      Subscription.aggregate([
        {
          $group: {
            _id: "$plan",
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [{ $eq: ["$status", "active"] }, 1, 0]
              }
            },
            revenue: { $sum: "$customAmount.amount" }
          }
        }
      ]),

      // Revenue by plan
      Subscription.aggregate([
        {
          $match: { status: "active" }
        },
        {
          $group: {
            _id: "$plan",
            monthlyRevenue: { $sum: "$customAmount.amount" },
            subscribers: { $sum: 1 }
          }
        }
      ]),

      // Active subscriptions count
      Subscription.countDocuments({ status: "active" }),

      // Monthly subscription trends
      Subscription.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            newSubscriptions: { $sum: 1 },
            revenue: { $sum: "$customAmount.amount" }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalSubscriptions: subscriptionStats.reduce((sum, stat) => sum + stat.total, 0),
          activeSubscriptions,
          totalRevenue: subscriptionStats.reduce((sum, stat) => sum + stat.revenue, 0)
        },
        plans: subscriptionStats.map(stat => ({
          plan: stat._id,
          total: stat.total,
          active: stat.active,
          revenue: stat.revenue,
          churnRate: stat.total ? ((stat.total - stat.active) / stat.total * 100).toFixed(2) : 0
        })),
        revenue: {
          byPlan: revenueByPlan.map(plan => ({
            plan: plan._id,
            monthlyRevenue: plan.monthlyRevenue,
            subscribers: plan.subscribers,
            arpu: plan.subscribers ? (plan.monthlyRevenue / plan.subscribers).toFixed(2) : 0
          }))
        },
        trends: {
          monthly: subscriptionTrends.map(trend => ({
            year: trend._id.year,
            month: trend._id.month,
            newSubscriptions: trend.newSubscriptions,
            revenue: trend.revenue
          }))
        }
      }
    });

  } catch (error) {
    console.error("Get subscription stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch subscription statistics! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// Export all controllers 📤
module.exports = {
  getAllCustomers,
  getCustomerDetails,
  getAllCampaigns,
  getAdminDashboardStats,
  getAllBusinesses,
  getBusinessDetails,
  getBusinessAnalytics,
  getSubscriptionStats
}; 