// Import dependencies 📦
const User = require("../models/user.model");
const Transaction = require("../models/transaction.model");
const { Subscription } = require("../models/subscription.model");
const mongoose = require("mongoose");
const Coupon = require("../models/coupon.model");
const CampaignLead = require("../models/campaignLead.model");
const Campaign = require("../models/campaign.model");
const BusinessAnalytics = require("../models/businessAnalytics.model");

// Get business profile 🏢
const getBusinessProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const business = await User.findOne({ 
      _id: userId, 
      role: "business",
    }).select(
      "-password -resetPasswordToken -resetPasswordExpires -verificationToken"
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business profile not found! 🔍",
      });
    }

    // Get subscription status
    const subscription = await Subscription.findOne({ 
      businessId: userId,
      status: "active",
    }).select("plan status billing.currentPeriodEnd");

    res.json({
      success: true,
      data: {
        ...business.toJSON(),
        subscription: subscription || null,
      },
    });
  } catch (error) {
    console.error("Get business profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch business profile! Please try again later 😢",
    });
  }
};

// Update business profile ✏️
const updateBusinessProfile = async (req, res) => {
  try {
    const userId = req.body.userId;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.password;
    delete updates.email;
    delete updates.role;
    delete updates.isVerified;
    delete updates.verificationToken;
    delete updates.resetPasswordToken;
    delete updates.resetPasswordExpires;

    const business = await User.findOneAndUpdate(
      { _id: userId, role: "business" },
      { $set: updates },
      { new: true, runValidators: true }
    ).select(
      "-password -resetPasswordToken -resetPasswordExpires -verificationToken"
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business profile not found! 🔍",
      });
    }

    res.json({
      success: true,
      message: "Business profile updated successfully! 🎉",
      data: business,
    });
  } catch (error) {
    console.error("Update business profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update business profile! Please try again later 😢",
    });
  }
};

// List customers with filters 👥
const listCustomers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const {
      page = 1,
      limit = 10,
      search,
      status,
      birthdayMonth,
      birthdayDay,
      birthdayRange,
      influencer
    } = req.query;

    // Convert businessId to ObjectId 🔄
    const businessObjectId = new mongoose.Types.ObjectId(businessId);
    
    // ============
    // First collect all customers that are linked to this business
    // ============
    const baseQuery = {
      $or: [
        { "voucherClaims.businessId": businessObjectId },
        { "guestDetails.businessId": businessObjectId },
      ],
    };

    // ============
    // Special handling for influencer filter
    // ============
    if (influencer) {
      // We'll completely replace the baseQuery when filtering by influencer
      // to ensure we ONLY get customers related to this influencer
      
      // Step 1: Get a list of IDs to filter by
      let customerIdsToInclude = new Set();
      
      // Step 2: Find all campaign leads related to this influencer
      const campaignLeadsWithInfluencer = await CampaignLead.find({
        businessId: businessObjectId,
        $or: [
          { "influencerDetails.name": new RegExp(influencer, "i") },
          { "influencerDetails.platform": new RegExp(influencer, "i") },
          { "referralCode": new RegExp(influencer, "i") }
        ]
      }).lean();

      // Step 3: Extract user IDs and emails from these leads
      const userIdsFromLeads = campaignLeadsWithInfluencer
        .filter(lead => lead.userId)
        .map(lead => lead.userId.toString());
      
      const emailsFromLeads = campaignLeadsWithInfluencer
        .filter(lead => lead.formData && lead.formData.email)
        .map(lead => lead.formData.email.toLowerCase());
      
      // Step 4: Find users by these emails (in case userId wasn't linked)
      let usersFromEmails = [];
      if (emailsFromLeads.length > 0) {
        usersFromEmails = await User.find({
          email: { $in: emailsFromLeads },
          $or: [
            { "voucherClaims.businessId": businessObjectId },
            { "guestDetails.businessId": businessObjectId },
          ]
        }).select('_id').lean();
      }
      
      // Step 5: Add these user IDs to our set
      userIdsFromLeads.forEach(id => customerIdsToInclude.add(id));
      usersFromEmails.forEach(user => customerIdsToInclude.add(user._id.toString()));
      
      // Step 6: Find all campaigns associated with this influencer
      const relatedCampaigns = await Campaign.find({
        businessId: businessObjectId,
        "influencers.name": new RegExp(influencer, "i")
      }).select('_id influencers').lean();
      
      // Step 7: Extract all referral codes for this influencer from campaigns
      const referralCodes = [];
      relatedCampaigns.forEach(campaign => {
        const matchingInfluencers = campaign.influencers.filter(inf => 
          new RegExp(influencer, "i").test(inf.name)
        );
        
        matchingInfluencers.forEach(inf => {
          if (inf.referralCode) {
            referralCodes.push(inf.referralCode);
          }
        });
      });
      
      // Step 8: Find users directly in User collection with these patterns
      const usersWithInfluencerSource = await User.find({
        $and: [
          { $or: [
            { "voucherClaims.businessId": businessObjectId },
            { "guestDetails.businessId": businessObjectId },
          ]},
          { $or: [
            { "guestDetails.source.influencerName": new RegExp(influencer, "i") },
            { "guestDetails.source.influencerPlatform": new RegExp(influencer, "i") },
            { "guestDetails.source.referralCode": { $in: referralCodes } }
          ]}
        ]
      }).select('_id').lean();
      
      usersWithInfluencerSource.forEach(user => 
        customerIdsToInclude.add(user._id.toString())
      );
      
      // Step 9: If we have referral codes, check for leads with those codes
      if (referralCodes.length > 0) {
        const campaignLeadsWithReferralCodes = await CampaignLead.find({
          businessId: businessObjectId,
          referralCode: { $in: referralCodes }
        }).select('userId formData.email').lean();
        
        // Add user IDs from these leads
        campaignLeadsWithReferralCodes
          .filter(lead => lead.userId)
          .forEach(lead => customerIdsToInclude.add(lead.userId.toString()));
          
        // Find users by emails from these leads
        const emailsFromReferralLeads = campaignLeadsWithReferralCodes
          .filter(lead => lead.formData && lead.formData.email)
          .map(lead => lead.formData.email.toLowerCase());
          
        if (emailsFromReferralLeads.length > 0) {
          const usersFromReferralEmails = await User.find({
            email: { $in: emailsFromReferralLeads },
            $or: [
              { "voucherClaims.businessId": businessObjectId },
              { "guestDetails.businessId": businessObjectId },
            ]
          }).select('_id').lean();
          
          usersFromReferralEmails.forEach(user => 
            customerIdsToInclude.add(user._id.toString())
          );
        }
      }
      
      // Step 10: Convert set to array for query
      const customerIdsArray = Array.from(customerIdsToInclude);

      // Step 11: IMPORTANT - Replace the base query entirely with just the IDs
      if (customerIdsArray.length > 0) {
        const objectIds = customerIdsArray
          .map(id => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch (e) {
              return null;
            }
          })
          .filter(id => id !== null);
        
        if (objectIds.length > 0) {
          // Replace the entire baseQuery to strictly filter by these IDs
          baseQuery._id = { $in: objectIds };
          // Remove the $or conditions as we're now filtering directly by ID
          delete baseQuery.$or;
        } else {
          // If no valid IDs, return no results instead of all customers
          baseQuery._id = { $in: [new mongoose.Types.ObjectId('000000000000000000000000')] };
          delete baseQuery.$or;
        }
      } else {
        // If no IDs found, return no results instead of all customers
        baseQuery._id = { $in: [new mongoose.Types.ObjectId('000000000000000000000000')] };
        delete baseQuery.$or;
      }
    }
    
    // ============
    // Add other filters
    // ============
    
    // Add Google Ads filter if provided 🎯
    if (req.query.google_ads === 'true') {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        "guestDetails.source.type": new RegExp('google_ads', 'i')
      });
    }

    // Add Agency filter if provided 🎯
    if (req.query.agency === 'true') {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        "guestDetails.source.type": new RegExp('agency', 'i')
      });
    }

    // Add Business filter if provided 🎯
    if (req.query.business === 'true') {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        "guestDetails.source.type": new RegExp('business', 'i')
      });
    }

    // Add search filter if provided 🔎
    if (search) {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        $or: [
          { firstName: new RegExp(search, "i") },
          { lastName: new RegExp(search, "i") },
          { email: new RegExp(search, "i") },
          { phoneNumber: new RegExp(search, "i") },
        ],
      });
    }

    // Add status filter if provided 🏷️
    if (status) {
      switch (status) {
        case "active":
          baseQuery["voucherClaims.status"] = "claimed";
          break;
        case "redeemed":
          baseQuery["voucherClaims.status"] = "redeemed";
          break;
        case "expired":
          baseQuery["voucherClaims.status"] = "expired";
          break;
        case "guest":
          baseQuery.isGuest = true;
          break;
      }
    }

    // Add birthday filter if provided 🎂
    if (birthdayMonth || birthdayDay || birthdayRange) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      if (birthdayRange) {
        // Calculate date range for upcoming birthdays
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + parseInt(birthdayRange));

        // Handle year wrap around
        const startMonth = startDate.getMonth() + 1;
        const startDay = startDate.getDate();
        const endMonth = endDate.getMonth() + 1;
        const endDay = endDate.getDate();

        if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) {
          baseQuery.$or = baseQuery.$or || [];
          baseQuery.$or.push({
            $expr: {
              $or: [
                {
                  $and: [
                    { $eq: [{ $month: "$dateOfBirth" }, startMonth] },
                    { $gte: [{ $dayOfMonth: "$dateOfBirth" }, startDay] },
                  ],
                },
                {
                  $and: [
                    { $eq: [{ $month: "$dateOfBirth" }, endMonth] },
                    { $lte: [{ $dayOfMonth: "$dateOfBirth" }, endDay] },
                  ],
                },
                {
                  $and: [
                    { $gt: [{ $month: "$dateOfBirth" }, startMonth] },
                    { $lt: [{ $month: "$dateOfBirth" }, endMonth] },
                  ],
                },
              ],
            },
          });
        } else {
          baseQuery.$expr = {
            $or: [
              {
                $and: [
                  { $eq: [{ $month: "$dateOfBirth" }, startMonth] },
                  { $gte: [{ $dayOfMonth: "$dateOfBirth" }, startDay] },
                  { $lte: [{ $dayOfMonth: "$dateOfBirth" }, endDay] },
                ],
              },
              {
                $and: [
                  { $gt: [{ $month: "$dateOfBirth" }, startMonth] },
                  { $lt: [{ $month: "$dateOfBirth" }, endMonth] },
                ],
              },
            ],
          };
        }
      } else if (birthdayMonth && birthdayDay) {
        baseQuery.$expr = {
          $and: [
            { $eq: [{ $month: "$dateOfBirth" }, parseInt(birthdayMonth)] },
            { $eq: [{ $dayOfMonth: "$dateOfBirth" }, parseInt(birthdayDay)] },
          ],
        };
      } else if (birthdayMonth) {
        baseQuery.$expr = {
          $eq: [{ $month: "$dateOfBirth" }, parseInt(birthdayMonth)],
        };
      }
    }

    const skip = (page - 1) * limit;

    // Get customers with aggregation pipeline 📊
    const customers = await User.aggregate([
      {
        $match: baseQuery,
      },
      // Add default arrays if null 🔄
      {
        $addFields: {
          voucherClaims: {
            $ifNull: ["$voucherClaims", []],
          },
          transactions: [],
        },
      },
      // Lookup voucher details 🎫
      {
        $lookup: {
          from: "coupons",
          localField: "voucherClaims.voucherId",
          foreignField: "_id",
          as: "voucherDetails",
        },
      },
      // Lookup campaign details 🎯
      {
        $lookup: {
          from: "campaigns",
          localField: "guestDetails.source.campaignId",
          foreignField: "_id",
          as: "campaignDetails"
        }
      },
      // Lookup transaction details 💳
      {
        $lookup: {
          from: "transactions",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$customerId", "$$userId"] },  // Changed from userId to customerId
                    { $eq: ["$businessId", businessObjectId] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
          ],
          as: "transactions",
        },
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          dateOfBirth: 1,
          isGuest: 1,
          guestDetails: 1,
          createdAt: 1,
          // Filter voucher claims for this business 🎫
          voucherClaims: {
            $filter: {
              input: "$voucherClaims",
              as: "claim",
              cond: {
                $eq: ["$$claim.businessId", businessObjectId]
              }
            }
          },
          // Calculate customer metrics 📊
          metrics: {
            totalSpent: {
              $sum: "$transactions.finalAmount"  // Changed from amount to finalAmount
            },
            totalDiscounts: {
              $sum: "$transactions.discountAmount"
            },
            visitsCount: {
              $size: "$transactions"
            },
            lastVisit: {
              $max: "$transactions.createdAt"
            },
            firstVisit: {
              $min: "$transactions.createdAt"
            },
            activeClaims: {
              $size: {
                $filter: {
                  input: "$voucherClaims",
                  as: "claim",
                  cond: {
                    $and: [
                      { $eq: ["$$claim.businessId", businessObjectId] },
                      { $eq: ["$$claim.status", "claimed"] }
                    ]
                  }
                }
              }
            },
            redeemedClaims: {
              $size: {
                $filter: {
                  input: "$voucherClaims",
                  as: "claim",
                  cond: {
                    $and: [
                      { $eq: ["$$claim.businessId", businessObjectId] },
                      { $eq: ["$$claim.status", "redeemed"] }
                    ]
                  }
                }
              }
            },
          },
          // Get latest transactions 💰
          recentTransactions: {
            $slice: ["$transactions", 5]
          },
          // Include voucher details 🎫
          voucherDetails: 1,
          // Include campaign details 🎯
          campaignDetails: { $arrayElemAt: ["$campaignDetails", 0] }
        }
      },
      {
        $sort: {
          "metrics.lastVisit": -1,
          createdAt: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    // Get total count for pagination 📄
    const total = await User.countDocuments(baseQuery);

    // Process customers to add additional info 🔄
    const processedCustomers = customers.map((customer) => ({
      id: customer._id,
      basicInfo: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber || null,
        dateOfBirth: customer.dateOfBirth || null,
        isGuest: customer.isGuest || false,
        joinedDate: customer.createdAt,
        picUrl: customer.picUrl || null,
        gdprConsent: customer.gdprConsent || {
          marketing: false,
          analytics: false,
          consentDate: null
        },
        lastLogin: customer.lastLogin || null,
        isVerified: customer.isVerified || false,
        isActive: customer.isActive || false
      },
      // Add source tracking info 🎯
      sourceInfo: {
        type: customer.guestDetails?.claimedFrom || 'direct',
        details: customer.guestDetails?.source ? {
          type: customer.guestDetails.source.type,
          campaignName: customer.guestDetails.source.campaignName,
          influencerName: customer.guestDetails.source.influencerName,
          influencerPlatform: customer.guestDetails.source.influencerPlatform,
          referralCode: customer.guestDetails.source.referralCode,
          joinedAt: customer.guestDetails.source.joinedAt,
          campaign: customer.campaignDetails ? {
            id: customer.campaignDetails._id,
            name: customer.campaignDetails.name,
            type: customer.campaignDetails.type,
            status: customer.campaignDetails.status
          } : null
        } : null
      },
      voucherActivity: {
        claims: (customer.voucherClaims || []).map((claim) => {
          const voucherDetail = customer.voucherDetails?.find(
            (v) => v._id.toString() === claim.voucherId.toString()
          );
          return {
            id: claim._id,
            voucherId: claim.voucherId,
            status: claim.status,
            claimDate: claim.claimDate,
            redeemedDate: claim.redeemedDate,
            expiryDate: claim.expiryDate,
            claimMethod: claim.claimMethod,
            analytics: {
              ...claim.analytics,
              clickDate: claim.analytics?.clickDate || null,
              viewDate: claim.analytics?.viewDate || null,
              redeemDate: claim.analytics?.redeemDate || null,
              source: claim.analytics?.source || null
            },
            voucherInfo: voucherDetail
              ? {
                  title: voucherDetail.title,
                  discountType: voucherDetail.discountType,
                  discountValue: voucherDetail.discountValue,
                  code: voucherDetail.code,
                  minimumPurchase: voucherDetail.minimumPurchase || 0,
                  maximumDiscount: voucherDetail.maximumDiscount || null,
                }
              : null,
          };
        }),
        stats: {
          activeClaims: customer.metrics.activeClaims || 0,
          redeemedClaims: customer.metrics.redeemedClaims || 0,
          totalClaims: (customer.voucherClaims || []).length,
        },
      },
      transactionHistory: {
        totalSpent: customer.metrics.totalSpent || 0,
        totalDiscounts: customer.metrics.totalDiscounts || 0,
        visitsCount: customer.metrics.visitsCount || 0,
        lastVisit: customer.metrics.lastVisit,
        firstVisit: customer.metrics.firstVisit,
        averageSpent:
          customer.metrics.totalSpent && customer.metrics.visitsCount
            ? (customer.metrics.totalSpent / customer.metrics.visitsCount).toFixed(2)
            : 0,
        recentTransactions: (customer.recentTransactions || []).map((tx) => ({
          id: tx._id,
          amount: tx.finalAmount || tx.originalAmount || 0,  // Changed from amount to finalAmount
          discountAmount: tx.discountAmount || 0,
          date: tx.createdAt || tx.transactionDate,  // Added transactionDate as fallback
          voucherId: tx.voucherId || tx.couponId,  // Added couponId as fallback
          location: tx.location || null,
          status: tx.status || "completed",
        })),
      },
      engagement: {
        lastActive:
          customer.lastLogin ||
          customer.metrics.lastVisit ||
          customer.createdAt,
        totalVoucherViews:
          customer.voucherClaims?.reduce(
            (sum, claim) => sum + (claim.analytics?.viewCount || 0),
            0
          ) || 0,
        totalVoucherClicks:
          customer.voucherClaims?.reduce(
            (sum, claim) => sum + (claim.analytics?.clickCount || 0),
            0
          ) || 0,
        conversionRate:
          customer.metrics.visitsCount && customer.metrics.redeemedClaims
            ? ((customer.metrics.redeemedClaims / customer.metrics.visitsCount) * 100).toFixed(2)
            : "0.00",
      },
    }));

    // Calculate summary statistics 📊
    const summary = {
      total,
      activeCustomers: processedCustomers.filter(
        (c) => c.voucherActivity.stats.activeClaims > 0
      ).length,
      guestCustomers: processedCustomers.filter((c) => c.basicInfo.isGuest)
        .length,
      totalRevenue: processedCustomers.reduce(
        (sum, c) => sum + (c.transactionHistory.totalSpent || 0),
        0
      ),
      totalDiscounts: processedCustomers.reduce(
        (sum, c) => sum + (c.transactionHistory.totalDiscounts || 0),
        0
      ),
      // Add source breakdown 📊
      sourceBreakdown: {
        campaign: processedCustomers.filter(c => c.sourceInfo.type === 'campaign').length,
        popup: processedCustomers.filter(c => c.sourceInfo.type === 'popup').length,
        qr: processedCustomers.filter(c => c.sourceInfo.type === 'qr').length,
        widget: processedCustomers.filter(c => c.sourceInfo.type === 'widget').length,
        direct: processedCustomers.filter(c => c.sourceInfo.type === 'direct').length
      },
      // Add influencer breakdown 🎯
      influencerBreakdown: processedCustomers.reduce((acc, customer) => {
        if (customer.sourceInfo.details?.influencerName) {
          const key = customer.sourceInfo.details.influencerName;
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: {
        customers: processedCustomers,
        summary,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("List customers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customers! Please try again later 😢",
    });
  }
};

// Get customer details 👤
const getCustomerDetails = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const customerId = req.params.id;

    // Get customer basic info
    const customer = await User.findById(customerId).select(
      "firstName lastName email phoneNumber createdAt"
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found! 🔍",
      });
    }

    // Get customer's transaction history with this business
    const transactions = await Transaction.find({
      customerId: customerId,  // Changed from userId to customerId
      businessId,
    })
    .sort({ transactionDate: -1 })  // Changed from createdAt to transactionDate
      .select("originalAmount finalAmount discountAmount transactionDate couponId location");  // Updated field names

    // Calculate customer metrics
    const metrics = {
      totalSpent: transactions.reduce((sum, t) => sum + t.amount, 0),
      averageSpent: transactions.length
        ? transactions.reduce((sum, t) => sum + t.amount, 0) /
          transactions.length
        : 0,
      visitsCount: transactions.length,
      firstVisit: transactions.length
        ? transactions[transactions.length - 1].createdAt
        : null,
      lastVisit: transactions.length ? transactions[0].createdAt : null,
    };

    res.json({
      success: true,
      data: {
        customer,
        metrics,
        transactions,
      },
    });
  } catch (error) {
    console.error("Get customer details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer details! Please try again later 😢",
    });
  }
};

// List staff members 👥
const listStaff = async (req, res) => {
  try {
    const businessId = req.user.userId;

    const staff = await User.find({
      "businessProfile.businessId": businessId,
      role: { $in: ["manager", "staff"] },
    })
      .select("firstName lastName email role permissions lastLogin")
    .sort({ role: 1, firstName: 1 });

    res.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    console.error("List staff error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staff members! Please try again later 😢",
    });
  }
};

// Add staff member 👥
const addStaffMember = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { email, firstName, lastName, role, permissions } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered! 📧",
      });
    }

    // Create staff member
    const staffMember = new User({
      email,
      firstName,
      lastName,
      role,
      permissions,
      businessProfile: {
        businessId,
        role,
        permissions,
      },
      password: Math.random().toString(36).slice(-8), // Generate random password
    });

    await staffMember.save();

    // TODO: Send invitation email with password

    res.status(201).json({
      success: true,
      message: "Staff member added successfully! 🎉",
      data: {
        id: staffMember._id,
        email: staffMember.email,
        firstName: staffMember.firstName,
        lastName: staffMember.lastName,
        role: staffMember.role,
        permissions: staffMember.permissions,
      },
    });
  } catch (error) {
    console.error("Add staff member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add staff member! Please try again later 😢",
    });
  }
};

// Remove staff member 🚫
const removeStaffMember = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const staffId = req.params.id;

    const staffMember = await User.findOneAndUpdate(
      {
        _id: staffId,
        "businessProfile.businessId": businessId,
        role: { $in: ["manager", "staff"] },
      },
      {
        $unset: {
          businessProfile: 1,
          permissions: 1,
        },
        $set: {
          role: "customer",
        },
      }
    );

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found! 🔍",
      });
    }

    res.json({
      success: true,
      message: "Staff member removed successfully! 👋",
    });
  } catch (error) {
    console.error("Remove staff member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove staff member! Please try again later 😢",
    });
  }
};

// Get all businesses (Admin only) 🏢
const getAllBusinesses = async (req, res) => {
  try {
    // Check if user is admin 👑
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can access this resource! 🚫",
      });
    }

    // Get pagination parameters 📄
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get search and filter parameters 🔍
    const search = req.query.search || "";
    const status = req.query.status;
    const category = req.query.category;
    const verificationStatus = req.query.verified;
    const subscriptionStatus = req.query.subscriptionStatus;
    const sortBy = req.query.sortBy || "createdAt"; // Default sort by creation date
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1; // Default to descending

    // Build query 🏗️
    const query = { role: "business" };

    // Add search condition
    if (search) {
      query.$or = [
        { "businessProfile.businessName": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    // Add verification filter
    if (verificationStatus !== undefined) {
      query.isVerified = verificationStatus === "true";
    }

    // Add status filter
    if (status) {
      query.isActive = status === "active";
    }

    // Add category filter
    if (category) {
      query["businessProfile.category"] = category;
    }

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Get businesses with pagination and sorting
    const businesses = await User.find(query)
      .select(
        "firstName lastName email phoneNumber picUrl dateOfBirth businessProfile isVerified isActive createdAt updatedAt lastLogin gdprConsent businessName businessCategory businessDescription businessLocation"
      )
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    // Get subscription details for each business
    const businessesWithDetails = await Promise.all(
      businesses.map(async (business) => {
        const subscription = await Subscription.findOne({ 
          businessId: business._id,
        }).sort({ createdAt: -1 }); // Get the most recent subscription
        
        // Format business data
        return {
          id: business._id,
          basicInfo: {
            firstName: business.firstName,
            lastName: business.lastName,
            email: business.email,
            phoneNumber: business.phoneNumber || "Not provided",
            profilePicture: business.picUrl || null,
            dateOfBirth: business.dateOfBirth || null,
          },
          businessProfile: {
            businessName:
              business.businessProfile?.businessName ||
              business.businessName ||
              "Not set",
            category:
              business.businessProfile?.category ||
              business.businessCategory ||
              "Not set",
            description:
              business.businessProfile?.description ||
              business.businessDescription ||
              "Not provided",
            location: {
              address:
                business.businessProfile?.location?.address ||
                business.businessLocation?.address ||
                null,
              city:
                business.businessProfile?.location?.city ||
                business.businessLocation?.city ||
                null,
              state:
                business.businessProfile?.location?.state ||
                business.businessLocation?.state ||
                null,
              country:
                business.businessProfile?.location?.country ||
                business.businessLocation?.country ||
                null,
              zipCode:
                business.businessProfile?.location?.zipCode ||
                business.businessLocation?.zipCode ||
                null,
              coordinates: {
                lat:
                  business.businessProfile?.location?.coordinates?.lat ||
                  business.businessLocation?.coordinates?.lat ||
                  null,
                lng:
                  business.businessProfile?.location?.coordinates?.lng ||
                  business.businessLocation?.coordinates?.lng ||
                  null,
              },
            },
          },
          status: {
            isVerified: business.isVerified || false,
            isActive: business.isActive || false,
            verificationBadge: business.isVerified ? "✅" : "⚠️",
            activeStatus: business.isActive ? "🟢 Active" : "🔴 Inactive",
          },
          subscription: subscription
            ? {
            plan: subscription.plan,
            status: subscription.status,
            validUntil: subscription.billing?.currentPeriodEnd,
            autoRenew: !subscription.billing?.cancelAtPeriodEnd,
            features: subscription.features || {},
            stripeDetails: {
              customerId: subscription.stripeCustomerId,
                  subscriptionId: subscription.stripeSubscriptionId,
                },
              }
            : {
                plan: "No active subscription",
                status: "inactive",
            validUntil: null,
            autoRenew: false,
                features: {},
          },
          gdprConsent: {
            marketing: business.gdprConsent?.marketing || false,
            analytics: business.gdprConsent?.analytics || false,
            lastUpdated: business.gdprConsent?.consentDate,
          },
          activity: {
            lastLogin: business.lastLogin || "Never logged in",
            createdAt: business.createdAt,
            updatedAt: business.updatedAt,
          },
          metadata: {
            registrationIP: business.registrationIP,
            lastLoginIP: business.lastLoginIP,
            deviceInfo: business.deviceInfo || {},
            browser: business.browser || "Unknown",
          },
        };
      })
    );

    // Calculate statistics 📊
    const stats = {
      total,
      activeToday: businessesWithDetails.filter((b) => {
        const today = new Date();
        const lastLogin = new Date(b.activity.lastLogin);
        return (
          b.status.isActive && lastLogin.toDateString() === today.toDateString()
        );
      }).length,
      byStatus: {
        verified: businessesWithDetails.filter((b) => b.status.isVerified)
          .length,
        unverified: businessesWithDetails.filter((b) => !b.status.isVerified)
          .length,
        active: businessesWithDetails.filter((b) => b.status.isActive).length,
        inactive: businessesWithDetails.filter((b) => !b.status.isActive)
          .length,
      },
      bySubscription: {
        basic: businessesWithDetails.filter(
          (b) => b.subscription.plan === "basic"
        ).length,
        premium: businessesWithDetails.filter(
          (b) => b.subscription.plan === "premium"
        ).length,
        enterprise: businessesWithDetails.filter(
          (b) => b.subscription.plan === "enterprise"
        ).length,
        noSubscription: businessesWithDetails.filter(
          (b) => b.subscription.plan === "No active subscription"
        ).length,
      },
      byConsent: {
        marketing: businessesWithDetails.filter((b) => b.gdprConsent.marketing)
          .length,
        analytics: businessesWithDetails.filter((b) => b.gdprConsent.analytics)
          .length,
      },
    };

    // Return formatted response
    return res.json({
      success: true,
      timestamp: new Date(),
      data: {
        statistics: stats,
        businesses: businessesWithDetails,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
          nextPage: page < Math.ceil(total / limit) ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null,
        },
        filters: {
          search: search || null,
          status: status || null,
          category: category || null,
          verificationStatus: verificationStatus || null,
          subscriptionStatus: subscriptionStatus || null,
        },
        sorting: {
          field: sortBy,
          order: sortOrder === 1 ? "asc" : "desc",
      },
      },
      message: "Businesses fetched successfully! 🎉",
    });
  } catch (error) {
    console.error("Get all businesses error:", error);
    return res.status(500).json({
      success: false,
      timestamp: new Date(),
      message: "Failed to fetch businesses! Please try again later 😢",
      error:
        process.env.NODE_ENV === "development"
          ? {
        message: error.message,
              stack: error.stack,
            }
          : undefined,
    });
  }
};

// Update customer details 👤
const updateCustomerDetails = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const customerId = req.params.id;
    const updates = req.body;

    // 🔒 Security: Fields that shouldn't be updated by business
    const restrictedFields = [
      "password",
      "role",
      "isVerified",
      "verificationToken",
      "resetPasswordToken",
      "resetPasswordExpires",
      "subscription",
      "businessProfile",
      "voucherClaims",
    ];

    // Remove restricted fields
    restrictedFields.forEach((field) => delete updates[field]);

    // 🔍 Find customer and verify they belong to this business
    const customer = await User.findOne({
      _id: customerId,
      $or: [
        { "voucherClaims.businessId": businessId },
        { "guestDetails.businessId": businessId },
      ],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or not associated with your business 🔍",
      });
    }

    // 📝 Validate updates
    if (updates.email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        email: updates.email,
        _id: { $ne: customerId },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already in use by another customer 📧",
        });
      }
    }

    // 🔄 Update customer details
    const updatedCustomer = await User.findByIdAndUpdate(
      customerId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
        select:
          "-password -resetPasswordToken -resetPasswordExpires -verificationToken",
      }
    );

    // 📝 Log the update in development
    if (process.env.NODE_ENV === "development") {
      console.log("Customer updated:", {
        businessId,
        customerId,
        updates: JSON.stringify(updates),
      });
    }

    res.json({
      success: true,
      message: "Customer details updated successfully! 🎉",
      data: {
        customer: {
          id: updatedCustomer._id,
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          email: updatedCustomer.email,
          phoneNumber: updatedCustomer.phoneNumber,
          dateOfBirth: updatedCustomer.dateOfBirth,
          isGuest: updatedCustomer.isGuest,
          guestDetails: updatedCustomer.guestDetails,
          gdprConsent: updatedCustomer.gdprConsent,
          updatedAt: updatedCustomer.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Update customer details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update customer details ❌",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get dashboard statistics 📊
const getDashboardStats = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const businessObjectId = new mongoose.Types.ObjectId(businessId);

    // Get date range for monthly stats 📅
    const today = new Date();
    
    // Get last 12 months for trends 📈
    const last12Months = Array.from({length: 12}, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      return {
        month: date.getMonth(),
        year: date.getFullYear(),
        monthYear: `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`
      };
    }).reverse();

    // Get business analytics data
    let businessAnalytics = await BusinessAnalytics.findOne({ businessId: businessObjectId });
    if (!businessAnalytics) {
      businessAnalytics = new BusinessAnalytics({ businessId: businessObjectId });
      await businessAnalytics.save();
    }

    // Get all coupons stats 🎫
    const couponsStats = await Coupon.aggregate([
      {
        $match: { businessId: businessObjectId }
      },
      {
        $group: {
          _id: null,
          totalCoupons: { $sum: 1 },
          activeCoupons: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ["$isActive", true] },
                  { $or: [
                    { $eq: ["$endDate", null] },
                    { $gt: ["$endDate", today] }
                  ]}
                ]},
                1,
                0
              ]
            }
          },
          totalQRScans: { $sum: { $ifNull: ["$analytics.qrCodeScans", 0] } },
          totalRedemptions: { $sum: { $ifNull: ["$analytics.redemptions", 0] } }
        }
      }
    ]);

    // Get customer stats 👥
    const customerStats = await User.aggregate([
      {
        $match: {
          $or: [
            { "voucherClaims.businessId": businessObjectId },
            { "guestDetails.businessId": businessObjectId }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          guestCustomers: {
            $sum: { $cond: [{ $eq: ["$isGuest", true] }, 1, 0] }
          },
          activeCustomers: {
            $sum: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$voucherClaims", []] } }, 0] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Process monthly trends data 📊
    const monthlyTrends = last12Months.map(month => {
      const monthStats = businessAnalytics.monthlyStats.find(
        stats => stats.month === month.month + 1 && stats.year === month.year
      ) || { revenue: 0, qrScans: 0 };

      return {
        month: month.monthYear,
        revenue: monthStats.revenue || 0,
        qrScans: monthStats.qrScans || 0
      };
    });

    // Format device and browser stats
    const deviceStats = Object.entries(businessAnalytics.deviceStats || {}).map(([type, count]) => ({
      type,
      count,
      percentage: ((count / (customerStats[0]?.totalCustomers || 1)) * 100).toFixed(1)
    })).filter(stat => stat.count > 0);

    const browserStats = Array.from(businessAnalytics.browserStats || []).map(([name, count]) => ({
      name,
      count,
      percentage: ((count / (customerStats[0]?.totalCustomers || 1)) * 100).toFixed(1)
    })).filter(stat => stat.count > 0);

    // Calculate total stats 📊
    const stats = {
      coupons: {
        total: couponsStats[0]?.totalCoupons || 0,
        active: couponsStats[0]?.activeCoupons || 0,
        qrScans: businessAnalytics.totalQRScans || 0,
        redemptions: couponsStats[0]?.totalRedemptions || 0
      },
      revenue: {
        total: businessAnalytics.totalRevenue || 0,
        monthly: monthlyTrends[monthlyTrends.length - 1].revenue,
        trends: monthlyTrends
      },
      customers: {
        total: customerStats[0]?.totalCustomers || 0,
        active: customerStats[0]?.activeCustomers || 0,
        guest: customerStats[0]?.guestCustomers || 0
      },
      visitors: {
        devices: deviceStats,
        browsers: browserStats
      },
      monthlyStats: {
        revenue: monthlyTrends,
        qrScans: monthlyTrends.map(m => ({
          month: m.month,
          count: m.qrScans
        }))
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics! 😢",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get top customers based on different filters 🏆
const getTopCustomers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const businessObjectId = new mongoose.Types.ObjectId(businessId);

    // Get filter parameters from query 🎯
    const {
      filterBy = 'totalClaims', // Default filter
      limit = 5,
      startDate,
      endDate,
      status, // 'claimed' or 'redeemed'
      minAmount = 0,
      minClaims = 0,
      minRedemptions = 0
    } = req.query;

    // Base match stage for all queries 🔍
    const baseMatch = {
      "voucherClaims.businessId": businessObjectId
    };

    // Add date range filter if provided 📅
    if (startDate || endDate) {
      baseMatch["voucherClaims.claimDate"] = {};
      if (startDate) baseMatch["voucherClaims.claimDate"].$gte = new Date(startDate);
      if (endDate) baseMatch["voucherClaims.claimDate"].$lte = new Date(endDate);
    }

    // Build aggregation pipeline based on filter type 📊
    const pipeline = [
      { $match: baseMatch },
      // Filter voucherClaims for this business
      {
        $addFields: {
          businessClaims: {
            $filter: {
              input: "$voucherClaims",
              as: "claim",
              cond: { $eq: ["$$claim.businessId", businessObjectId] }
            }
          }
        }
      },
      // Add calculated fields for claims and extract couponIds
      {
        $addFields: {
          totalClaims: { $size: "$businessClaims" },
          activeClaims: {
            $size: {
              $filter: {
                input: "$businessClaims",
                as: "claim",
                cond: { $eq: ["$$claim.status", "claimed"] }
              }
            }
          },
          redeemedClaims: {
            $size: {
              $filter: {
                input: "$businessClaims",
                as: "claim",
                cond: { $eq: ["$$claim.status", "redeemed"] }
              }
            }
          },
          // Create an array of coupon ids from voucher claims
          couponIds: {
            $map: {
              input: "$businessClaims",
              as: "claim",
              in: "$$claim.voucherId"
            }
          }
        }
      },
      // Calculate unique coupons used using couponIds
      {
        $addFields: {
          uniqueCoupons: { $size: { $setUnion: ["$couponIds", []] } }
        }
      },
      // Lookup coupon details from coupons collection
      {
        $lookup: {
          from: "coupons",
          localField: "couponIds",
          foreignField: "_id",
          as: "couponsInfo"
        }
      },
      // Lookup transactions for each customer
      {
        $lookup: {
          from: "transactions",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$businessId", businessObjectId] }
                  ]
                }
              }
            }
          ],
          as: "transactions"
        }
      },
      // Add transaction metrics
      {
        $addFields: {
          totalSpent: { $sum: "$transactions.amount" },
          totalTransactions: { $size: "$transactions" },
          avgTransactionValue: {
            $cond: [
              { $gt: [ { $size: "$transactions" }, 0 ] },
              { $divide: [ { $sum: "$transactions.amount" }, { $size: "$transactions" } ] },
              0
            ]
          },
          lastTransaction: { $max: "$transactions.createdAt" }
        }
      },
      // Add filter-specific match stage based on status
      ...(status && (status === 'claimed' || status === 'redeemed') ? [{
        $match: {
          [status === 'claimed' ? 'activeClaims' : 'redeemedClaims']: { $gt: 0 } // Filter based on whether status is claimed or redeemed
        }
      }] : []),
      ...(minAmount > 0 ? [{
        $match: {
          totalSpent: { $gte: parseFloat(minAmount) }
        }
      }] : []),
      ...(minClaims > 0 ? [{
        $match: {
          totalClaims: { $gte: parseInt(minClaims) }
        }
      }] : []),
      ...(minRedemptions > 0 ? [{
        $match: {
          redeemedClaims: { $gte: parseInt(minRedemptions) }
        }
      }] : []),
      // Sorting stage based on filter type 📋
      { $sort: (function() {
          // Simple sort logic
          switch (filterBy) {
            case 'totalSpent': return { totalSpent: -1 };
            case 'avgTransactionValue': return { avgTransactionValue: -1 };
            case 'totalTransactions': return { totalTransactions: -1 };
            case 'redeemedClaims': return { redeemedClaims: -1 };
            case 'activeClaims': return { activeClaims: -1 };
            case 'totalClaims':
            default: return { totalClaims: -1 };
          }
        })() 
      },
      // Limit the number of results
      { $limit: parseInt(limit) }
    ];

    // Execute aggregation
    const customers = await User.aggregate(pipeline);

    // Fetch business analytics for the current business (extra useful data) 📊
    const businessAnalytics = await BusinessAnalytics.findOne({ businessId: businessObjectId });

    // Process and format the response with extended data
    const formattedCustomers = customers.map((customer, index) => ({
      rank: index + 1,
      id: customer._id,
      basicInfo: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber || null,
        dateOfBirth: customer.dateOfBirth || null,
        isGuest: customer.isGuest || false,
        joinedDate: customer.createdAt
      },
      voucherMetrics: {
        totalClaims: customer.totalClaims,
        activeClaims: customer.activeClaims,
        redeemedClaims: customer.redeemedClaims,
        uniqueCouponsUsed: customer.uniqueCoupons, // Number of unique coupons used
        // Map coupon details (code and title) for display
        couponsUsed: (customer.couponsInfo || []).map(coupon => ({
          code: coupon.code,
          title: coupon.title
        })),
        claimToRedeemRate: customer.totalClaims ? 
          ((customer.redeemedClaims / customer.totalClaims) * 100).toFixed(2) + '%' : 
          '0%'
      },
      transactionMetrics: {
        totalSpent: customer.totalSpent || 0,
        totalTransactions: customer.totalTransactions || 0,
        avgTransactionValue: Number(customer.avgTransactionValue?.toFixed(2)) || 0,
        lastTransaction: customer.lastTransaction
      },
      source: customer.guestDetails?.source ? {
        type: customer.guestDetails.source.type,
        campaign: customer.guestDetails.source.campaignName,
        influencer: customer.guestDetails.source.influencerName,
        platform: customer.guestDetails.source.influencerPlatform
      } : null
    }));

    // Calculate summary statistics 📊
    const summary = {
      totalCustomers: formattedCustomers.length,
      metrics: {
        totalClaims: formattedCustomers.reduce((sum, c) => sum + c.voucherMetrics.totalClaims, 0),
        totalRedemptions: formattedCustomers.reduce((sum, c) => sum + c.voucherMetrics.redeemedClaims, 0),
        totalRevenue: formattedCustomers.reduce((sum, c) => sum + c.transactionMetrics.totalSpent, 0),
        avgClaimsPerCustomer: Number((formattedCustomers.reduce((sum, c) => sum + c.voucherMetrics.totalClaims, 0) / formattedCustomers.length).toFixed(2)),
        avgRedemptionsPerCustomer: Number((formattedCustomers.reduce((sum, c) => sum + c.voucherMetrics.redeemedClaims, 0) / formattedCustomers.length).toFixed(2))
      },
      filters: {
        type: filterBy,
        dateRange: {
          start: startDate || null,
          end: endDate || null
        },
        status: status || null,
        minimums: {
          amount: minAmount,
          claims: minClaims,
          redemptions: minRedemptions
        }
      }
    };

    // Send response including extended customer data and business analytics
    res.json({
      success: true,
      data: {
        customers: formattedCustomers,
        summary,
        businessAnalytics
      }
    });

  } catch (error) {
    console.error("Get top customers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top customers! 😢",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get unique influencers list 🎯
const getInfluencersList = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const businessObjectId = new mongoose.Types.ObjectId(businessId);

    // Get influencers from campaigns 🎯
    const campaignInfluencers = await Campaign.aggregate([
      {
        $match: {
          businessId: businessObjectId,
          'influencers.name': { $exists: true, $ne: null }
        }
      },
      {
        $unwind: '$influencers'
      },
      {
        $group: {
          _id: {
            name: '$influencers.name',
            platform: '$influencers.platform'
          },
          campaigns: { $addToSet: '$name' },
          totalClicks: { $sum: '$influencers.stats.clicks' },
          totalConversions: { $sum: '$influencers.stats.conversions' },
          totalRevenue: { $sum: '$influencers.stats.revenue' },
          lastActive: { $max: '$updatedAt' }
        }
      }
    ]);

    // Get influencers from campaign leads 📊
    const leadInfluencers = await CampaignLead.aggregate([
      {
        $match: {
          businessId: businessObjectId,
          'influencerDetails.name': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            name: '$influencerDetails.name',
            platform: '$influencerDetails.platform'
          },
          leadsCount: { $sum: 1 },
          lastActive: { $max: '$createdAt' }
        }
      }
    ]);

    // Get all influencers with their referral codes from campaigns
    const campaignReferralCodes = await Campaign.aggregate([
      {
        $match: {
          businessId: businessObjectId,
          'influencers.name': { $exists: true, $ne: null }
        }
      },
      {
        $unwind: '$influencers'
      },
      {
        $group: {
          _id: {
            name: '$influencers.name',
            platform: '$influencers.platform'
          },
          referralCodes: { $addToSet: '$influencers.referralCode' }
        }
      }
    ]);

    // Get leads count by referral code
    const referralLeadCounts = await CampaignLead.aggregate([
      {
        $match: {
          businessId: businessObjectId
        }
      },
      {
        $group: {
          _id: '$referralCode',
          count: { $sum: 1 }
        }
      }
    ]);

    // Create map of referral code to leads count
    const referralCodeLeadsMap = new Map();
    referralLeadCounts.forEach(item => {
      referralCodeLeadsMap.set(item._id, item.count);
    });

    // Merge influencers data from both sources 🔄
    const mergedInfluencers = new Map();

    // Process campaign influencers
    campaignInfluencers.forEach(inf => {
      const key = `${inf._id.name}-${inf._id.platform}`;
      mergedInfluencers.set(key, {
        name: inf._id.name,
        platform: inf._id.platform,
        metrics: {
          campaigns: inf.campaigns,
          totalClicks: inf.totalClicks || 0,
          totalConversions: inf.totalConversions || 0,
          totalRevenue: inf.totalRevenue || 0,
          leadsCount: 0,
          lastActive: inf.lastActive
        }
      });
    });

    // Update lead counts from referral codes
    campaignReferralCodes.forEach(inf => {
      const key = `${inf._id.name}-${inf._id.platform}`;
      if (mergedInfluencers.has(key)) {
        const existing = mergedInfluencers.get(key);
        // Count leads from all referral codes belonging to this influencer
        let totalLeadsFromReferrals = 0;
        inf.referralCodes.forEach(code => {
          totalLeadsFromReferrals += referralCodeLeadsMap.get(code) || 0;
        });
        
        // Update leads count if not already set by lead influencers
        if (totalLeadsFromReferrals > 0) {
          existing.metrics.leadsCount = totalLeadsFromReferrals;
        }
      }
    });

    // Process lead influencers
    leadInfluencers.forEach(inf => {
      const key = `${inf._id.name}-${inf._id.platform}`;
      if (mergedInfluencers.has(key)) {
        const existing = mergedInfluencers.get(key);
        // Only update if the lead count from the leads collection is higher
        if (inf.leadsCount > existing.metrics.leadsCount) {
          existing.metrics.leadsCount = inf.leadsCount;
        }
        existing.metrics.lastActive = new Date(Math.max(
          existing.metrics.lastActive,
          inf.lastActive
        ));
      } else {
        mergedInfluencers.set(key, {
          name: inf._id.name,
          platform: inf._id.platform,
          metrics: {
            campaigns: [],
            totalClicks: 0,
            totalConversions: 0,
            totalRevenue: 0,
            leadsCount: inf.leadsCount,
            lastActive: inf.lastActive
          }
        });
      }
    });

    // Convert map to array and sort by total conversions
    const influencers = Array.from(mergedInfluencers.values())
      .sort((a, b) => b.metrics.totalConversions - a.metrics.totalConversions);

    // Calculate summary statistics 📊
    const summary = {
      total: influencers.length,
      totalLeads: influencers.reduce((sum, inf) => sum + inf.metrics.leadsCount, 0),
      totalRevenue: influencers.reduce((sum, inf) => sum + inf.metrics.totalRevenue, 0),
      totalClicks: influencers.reduce((sum, inf) => sum + inf.metrics.totalClicks, 0),
      totalConversions: influencers.reduce((sum, inf) => sum + inf.metrics.totalConversions, 0),
      platformBreakdown: influencers.reduce((acc, inf) => {
        acc[inf.platform] = (acc[inf.platform] || 0) + 1;
        return acc;
      }, {}),
      averageConversionRate: influencers.length ? 
        (influencers.reduce((sum, inf) => 
          sum + (inf.metrics.totalClicks ? 
            (inf.metrics.totalConversions / inf.metrics.totalClicks) * 100 : 0
          ), 0) / influencers.length).toFixed(2) : "0.00"
    };

    res.json({
      success: true,
      data: {
        influencers,
        summary
      }
    });
  } catch (error) {
    console.error("Get influencers list error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch influencers list! 😢",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get business by ID 🏢
const getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.body;

    // Validate businessId
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID is required! 🚫'
      });
    }

    // Find business with all details
    const business = await User.findOne(
      { 
        _id: businessId,
        role: 'business'
      }
    ).select('-password -verificationToken -resetPasswordToken -resetPasswordExpires');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🚫'
      });
    }

    // Format business details for response
    // const businessData = {
    //   id: business._id,
    //   email: business.email,
    //   phoneNumber: business.phoneNumber,
    //   role: business.role,
    //   isVerified: business.isVerified,
    //   createdAt: business.createdAt,
    //   updatedAt: business.updatedAt,
    //   profile: {
    //     businessName: business.businessProfile?.businessName || '',
    //     logo: business.businessProfile?.logo || '',
    //     banner: business.businessProfile?.banner || '',
    //     description: business.businessProfile?.description || '',
    //     category: business.businessProfile?.category || '',
    //     website: business.businessProfile?.website || '',
    //     socialLinks: business.businessProfile?.socialLinks || {},
    //     location: business.businessProfile?.location || '',
    //     address: business.businessProfile?.address || '',
    //     openingHours: business.businessProfile?.openingHours || {},
    //     contactEmail: business.businessProfile?.contactEmail || '',
    //     contactPhone: business.businessProfile?.contactPhone || '',
    //   },
    //   settings: {
    //     notifications: business.businessProfile?.settings?.notifications || {},
    //     appearance: business.businessProfile?.settings?.appearance || {},
    //     privacy: business.businessProfile?.settings?.privacy || {},
    //     widgetSettings: business.businessProfile?.widgetSettings || {}
    //   },
    //   stats: {
    //     totalVouchers: business.businessProfile?.stats?.totalVouchers || 0,
    //     activeVouchers: business.businessProfile?.stats?.activeVouchers || 0,
    //     totalCustomers: business.businessProfile?.stats?.totalCustomers || 0,
    //     totalRevenue: business.businessProfile?.stats?.totalRevenue || 0,
    //     totalRedemptions: business.businessProfile?.stats?.totalRedemptions || 0
    //   }
    // };

    res.json({
      success: true,
      data: business
    });

  } catch (error) {
    console.error('Get business by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business details! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update terms and conditions 📄
const updateTermsAndConditions = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const { text } = req.body;

    // Validate text
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Terms and conditions text is required! 📝'
      });
    }

    // Update terms and conditions
    const business = await User.findOneAndUpdate(
      { _id: businessId, role: 'business' },
      {
        $set: {
          'businessProfile.termsAndConditions': {
            text: text.trim(),
            lastUpdated: new Date()
          }
        }
      },
      { new: true }
    ).select('businessProfile.termsAndConditions');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🔍'
      });
    }

    res.json({
      success: true,
      message: 'Terms and conditions updated successfully! 🎉',
      data: {
        termsAndConditions: business.businessProfile.termsAndConditions
      }
    });

  } catch (error) {
    console.error('Update terms and conditions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update terms and conditions! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get terms and conditions 📋
const getTermsAndConditions = async (req, res) => {
  try {
    const businessId = req.params.businessId || req.user.userId;

    const business = await User.findOne(
      { _id: businessId, role: 'business' }
    ).select('businessProfile.termsAndConditions');

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found! 🔍'
      });
    }

    res.json({
      success: true,
      data: {
        termsAndConditions: business.businessProfile.termsAndConditions || {
          text: '',
          lastUpdated: null
        }
      }
    });

  } catch (error) {
    console.error('Get terms and conditions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all customers with advanced filters 📊
const getAllCustomers = async (req, res) => {
  try {
    const businessId = req.user.userId;
    const businessObjectId = new mongoose.Types.ObjectId(businessId);
    const {
      // Date Range Filters
      birthDateStart,
      birthDateEnd,
      joinDateStart,
      joinDateEnd,
      lastActiveStart,
      lastActiveEnd,
      lastLoginStart,
      lastLoginEnd,
      lastVisitStart,
      lastVisitEnd,

      // Status Filters
      verificationStatus,
      activeStatus,
      isGuest,

      // Amount Range Filters
      spentAmountMin,
      spentAmountMax,
      averageSpentMin,
      averageSpentMax,
      totalDiscountsMin,
      totalDiscountsMax,

      // Voucher Filters
      hasVouchers,
      voucherClaimsMin,
      voucherClaimsMax,
      voucherStatus,

      // Consent Filters
      consentStatus,
      consentDateStart,
      consentDateEnd,

      // Source Filters
      sourceType,
      campaignId,
      campaignName,
      influencerName,
      influencerPlatform,

      // Engagement Filters
      voucherViewsMin,
      voucherViewsMax,
      voucherClicksMin,
      voucherClicksMax,
      conversionRateMin,
      conversionRateMax,

      // Visit Filters
      visitsCountMin,
      visitsCountMax,

      // Search and Sorting
      search,
      searchFields,
      sortBy = 'createdAt',
      sortOrder = 'desc',

      // Pagination and Format
      page = 1,
      limit = 10,
      format = 'json',
      exportFormat
    } = req.query;

    // Build base query 🏗️
    const query = {
      $or: [
        { "voucherClaims.businessId": businessObjectId },
        { "guestDetails.businessId": businessObjectId }
      ]
    };

    // Add Date Range Filters 📅
    if (birthDateStart || birthDateEnd) {
      query.dateOfBirth = {};
      if (birthDateStart) query.dateOfBirth.$gte = new Date(birthDateStart);
      if (birthDateEnd) query.dateOfBirth.$lte = new Date(birthDateEnd);
    }

    if (joinDateStart || joinDateEnd) {
      query.createdAt = {};
      if (joinDateStart) query.createdAt.$gte = new Date(joinDateStart);
      if (joinDateEnd) query.createdAt.$lte = new Date(joinDateEnd);
    }

    if (lastLoginStart || lastLoginEnd) {
      query.lastLogin = {};
      if (lastLoginStart) query.lastLogin.$gte = new Date(lastLoginStart);
      if (lastLoginEnd) query.lastLogin.$lte = new Date(lastLoginEnd);
    }

    // Add Status Filters 🏷️
    if (verificationStatus) {
      query.isVerified = verificationStatus === 'verified';
    }

    if (activeStatus) {
      query.isActive = activeStatus === 'active';
    }

    if (isGuest !== undefined) {
      query.isGuest = isGuest === 'true';
    }

    // Add Source Filters 🎯
    if (sourceType) {
      query['guestDetails.source.type'] = sourceType;
    }

    if (campaignId) {
      query['guestDetails.source.campaignId'] = new mongoose.Types.ObjectId(campaignId);
    }

    if (campaignName) {
      query['guestDetails.source.campaignName'] = new RegExp(campaignName, 'i');
    }

    if (influencerName) {
      query['guestDetails.source.influencerName'] = new RegExp(influencerName, 'i');
    }

    if (influencerPlatform) {
      query['guestDetails.source.influencerPlatform'] = influencerPlatform;
    }

    // Add Consent Filters 🔒
    if (consentStatus) {
      switch (consentStatus) {
        case 'marketing':
          query['gdprConsent.marketing'] = true;
          break;
        case 'analytics':
          query['gdprConsent.analytics'] = true;
          break;
        case 'both':
          query['gdprConsent.marketing'] = true;
          query['gdprConsent.analytics'] = true;
          break;
        case 'none':
          query.$or = [
            { 'gdprConsent.marketing': false },
            { 'gdprConsent.analytics': false }
          ];
          break;
      }
    }

    if (consentDateStart || consentDateEnd) {
      query['gdprConsent.consentDate'] = {};
      if (consentDateStart) query['gdprConsent.consentDate'].$gte = new Date(consentDateStart);
      if (consentDateEnd) query['gdprConsent.consentDate'].$lte = new Date(consentDateEnd);
    }

    // Add Search Filter 🔍
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchFieldsArray = searchFields ? searchFields.split(',') : ['email', 'firstName', 'lastName', 'phoneNumber'];
      query.$or = searchFieldsArray.map(field => ({ [field]: searchRegex }));
    }

    // Get total count for pagination 📄
    const total = await User.countDocuments(query);

    // Build aggregation pipeline 📊
    const pipeline = [
      { $match: query },
      // Add default arrays if null
      {
        $addFields: {
          transactions: { $ifNull: ['$transactions', []] },
          voucherClaims: { $ifNull: ['$voucherClaims', []] }
        }
      },
      // Lookup voucher details
      {
        $lookup: {
          from: 'coupons',
          localField: 'voucherClaims.voucherId',
          foreignField: '_id',
          as: 'voucherDetails'
        }
      },
      // Lookup transaction details
      {
        $lookup: {
          from: 'transactions',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$userId'] },
                    { $eq: ['$businessId', businessObjectId] }
                  ]
                }
              }
            }
          ],
          as: 'transactions'
        }
      },
      // Add calculated fields
      {
        $addFields: {
          totalSpent: { $sum: '$transactions.amount' },
          averageSpent: {
            $cond: [
              { $gt: [{ $size: '$transactions' }, 0] },
              { $divide: [{ $sum: '$transactions.amount' }, { $size: '$transactions' }] },
              0
            ]
          },
          totalDiscounts: { $sum: '$transactions.discountAmount' },
          visitsCount: { $size: '$transactions' },
          voucherClaimsCount: { $size: '$voucherClaims' },
          lastVisit: { $max: '$transactions.createdAt' }
        }
      }
    ];

    // Add Amount Range Filters 💰
    if (spentAmountMin || spentAmountMax) {
      pipeline.push({
        $match: {
          totalSpent: {
            ...(spentAmountMin && { $gte: parseFloat(spentAmountMin) }),
            ...(spentAmountMax && { $lte: parseFloat(spentAmountMax) })
          }
        }
      });
    }

    if (averageSpentMin || averageSpentMax) {
      pipeline.push({
        $match: {
          averageSpent: {
            ...(averageSpentMin && { $gte: parseFloat(averageSpentMin) }),
            ...(averageSpentMax && { $lte: parseFloat(averageSpentMax) })
          }
        }
      });
    }

    // Add Visit Filters 👥
    if (visitsCountMin || visitsCountMax) {
      pipeline.push({
        $match: {
          visitsCount: {
            ...(visitsCountMin && { $gte: parseInt(visitsCountMin) }),
            ...(visitsCountMax && { $lte: parseInt(visitsCountMax) })
          }
        }
      });
    }

    // Add Voucher Filters 🎫
    if (voucherClaimsMin || voucherClaimsMax) {
      pipeline.push({
        $match: {
          voucherClaimsCount: {
            ...(voucherClaimsMin && { $gte: parseInt(voucherClaimsMin) }),
            ...(voucherClaimsMax && { $lte: parseInt(voucherClaimsMax) })
          }
        }
      });
    }

    // Add sorting 📋
    pipeline.push({ $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } });

    // Add pagination 📄
    if (!exportFormat) {
      pipeline.push(
        { $skip: (parseInt(page) - 1) * parseInt(limit) },
        { $limit: parseInt(limit) }
      );
    }

    // Execute aggregation
    let customers = await User.aggregate(pipeline);

    // Format response data 🔄
    customers = customers.map(customer => ({
      id: customer._id,
      basicInfo: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        dateOfBirth: customer.dateOfBirth,
        isGuest: customer.isGuest,
        isVerified: customer.isVerified,
        isActive: customer.isActive
      },
      metrics: {
        totalSpent: customer.totalSpent || 0,
        averageSpent: customer.averageSpent || 0,
        totalDiscounts: customer.totalDiscounts || 0,
        visitsCount: customer.visitsCount || 0,
        voucherClaimsCount: customer.voucherClaimsCount || 0,
        lastVisit: customer.lastVisit
      },
      source: customer.guestDetails?.source || null,
      gdprConsent: customer.gdprConsent || {
        marketing: false,
        analytics: false
      },
      joinedDate: customer.createdAt,
      lastLogin: customer.lastLogin
    }));

    // Handle export format 📤
    if (exportFormat === 'csv') {
      // Convert to CSV format
      const fields = [
        'id',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'dateOfBirth',
        'isGuest',
        'isVerified',
        'totalSpent',
        'averageSpent',
        'visitsCount',
        'voucherClaimsCount',
        'joinedDate'
      ];
      
      const csv = customers.map(customer => ({
        id: customer.id,
        firstName: customer.basicInfo.firstName,
        lastName: customer.basicInfo.lastName,
        email: customer.basicInfo.email,
        phoneNumber: customer.basicInfo.phoneNumber,
        dateOfBirth: customer.basicInfo.dateOfBirth,
        isGuest: customer.basicInfo.isGuest,
        isVerified: customer.basicInfo.isVerified,
        totalSpent: customer.metrics.totalSpent,
        averageSpent: customer.metrics.averageSpent,
        visitsCount: customer.metrics.visitsCount,
        voucherClaimsCount: customer.metrics.voucherClaimsCount,
        joinedDate: customer.joinedDate
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
      
      // Convert to CSV string
      // Create CSV string with header row and data rows
      const csvString = [
        fields.join(','), // Header row with field names
        ...csv.map(row => fields.map(field => JSON.stringify(row[field])).join(',')) // Data rows
      ].join('\n');

      return res.send(csvString);
    }

    // Return JSON response
    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        },
        filters: {
          dateRanges: {
            birthDate: { start: birthDateStart, end: birthDateEnd },
            joinDate: { start: joinDateStart, end: joinDateEnd },
            lastActive: { start: lastActiveStart, end: lastActiveEnd }
          },
          status: { verificationStatus, activeStatus, isGuest },
          amounts: {
            spent: { min: spentAmountMin, max: spentAmountMax },
            average: { min: averageSpentMin, max: averageSpentMax }
          },
          source: { sourceType, campaignId, influencerName, influencerPlatform },
          consent: { status: consentStatus },
          search: { term: search, fields: searchFields },
          sort: { by: sortBy, order: sortOrder }
        }
      }
    });

  } catch (error) {
    console.error('Get all customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers! 😢',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getBusinessProfile,
  updateBusinessProfile,
  listCustomers,
  getCustomerDetails,
  listStaff,
  addStaffMember,
  removeStaffMember,
  getAllBusinesses,
  updateCustomerDetails,
  getDashboardStats,
  getTopCustomers,
  getInfluencersList,
  getBusinessById,
  updateTermsAndConditions,
  getTermsAndConditions,
  getAllCustomers
}; 
