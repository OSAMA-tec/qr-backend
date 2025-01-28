// Import dependencies 📦
const { SubscriptionPlan, Subscription } = require('../models/subscription.model');
const User = require('../models/user.model');
const mongoose = require('mongoose');

// Comment out Stripe for now (will be used later) 🔄
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Error handler helper 🛠️
const handleError = (error, res) => {
  console.error('Subscription error:', error);
  return res.status(500).json({
    success: false,
    message: error.message || 'Subscription operation failed! 😢',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Create subscription plan 📝
const createPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      billingCycle,
      features
    } = req.body;

    // Check if plan already exists
    const existingPlan = await SubscriptionPlan.findOne({ name });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Plan already exists! 📋'
      });
    }

    // Create new plan
    const plan = new SubscriptionPlan({
      name,
      description,
      price: {
        amount: price,
        currency: 'USD'
      },
      billingCycle,
      features,
      isActive: true
    });

    await plan.save();

    res.json({
      success: true,
      message: 'Subscription plan created successfully! 🎉',
      data: plan
    });
  } catch (error) {
    handleError(error, res);
  }
};

// Initialize default plans 🚀
const initDefaultPlans = async () => {
  try {
    const defaultPlans = [
      {
        name: 'free',
        description: 'Basic features for small businesses',
        price: {
          amount: 0,
          currency: 'USD'
        },
        billingCycle: 'monthly',
        features: {
          maxCoupons: 5,
          maxQRCodes: 2,
          analyticsAccess: false,
          customBranding: false,
          apiAccess: false,
          prioritySupport: false,
          marketplaceAccess: false,
          maxLocations: 1,
          walletIntegration: false
        },
        isActive: true
      },
      {
        name: 'basic',
        description: 'Essential features for growing businesses',
        price: {
          amount: 29.99,
          currency: 'USD'
        },
        billingCycle: 'monthly',
        features: {
          maxCoupons: 20,
          maxQRCodes: 10,
          analyticsAccess: true,
          customBranding: false,
          apiAccess: false,
          prioritySupport: false,
          marketplaceAccess: true,
          maxLocations: 2,
          walletIntegration: true
        },
        isActive: true
      },
      {
        name: 'premium',
        description: 'Advanced features for established businesses',
        price: {
          amount: 99.99,
          currency: 'USD'
        },
        billingCycle: 'monthly',
        features: {
          maxCoupons: 100,
          maxQRCodes: 50,
          analyticsAccess: true,
          customBranding: true,
          apiAccess: true,
          prioritySupport: true,
          marketplaceAccess: true,
          maxLocations: 5,
          walletIntegration: true
        },
        isActive: true
      },
      {
        name: 'enterprise',
        description: 'Custom solutions for large businesses',
        price: {
          amount: 299.99,
          currency: 'USD'
        },
        billingCycle: 'monthly',
        features: {
          maxCoupons: -1, // unlimited
          maxQRCodes: -1, // unlimited
          analyticsAccess: true,
          customBranding: true,
          apiAccess: true,
          prioritySupport: true,
          marketplaceAccess: true,
          maxLocations: -1, // unlimited
          walletIntegration: true
        },
        isActive: true
      }
    ];

    for (const plan of defaultPlans) {
      await SubscriptionPlan.findOneAndUpdate(
        { name: plan.name },
        plan,
        { upsert: true, new: true }
      );
    }

    console.log('Default subscription plans initialized! 🎉');
  } catch (error) {
    console.error('Failed to initialize default plans:', error);
  }
};

// Call initDefaultPlans when the module loads
initDefaultPlans();

// Get all subscription plans 📋
const getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .select('-__v')
      .sort({ 'price.amount': 1 });

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    handleError(error, res);
  }
};

// Get business subscription details 💳
const getBusinessSubscription = async (req, res) => {
  try {
    const { businessId } = req.params;

    const subscription = await Subscription.findOne({ businessId })
      .select('-__v');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found for this business! 🔍'
      });
    }

    // Get plan details
    const plan = await SubscriptionPlan.findOne({ name: subscription.plan });

    res.json({
      success: true,
      data: {
        ...subscription.toObject(),
        planDetails: plan
      }
    });
  } catch (error) {
    handleError(error, res);
  }
};

// Create new subscription 🆕
const createSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      businessId, 
      planName, 
      billingCycle,
      // Manual subscription fields
      startDate = new Date(),
      duration = 30, // days
      paymentStatus = 'completed',
      paymentMethod = 'manual',
      paymentAmount,
      currency = 'USD'
    } = req.body;

    // Validate business exists
    const business = await User.findOne({ 
      _id: businessId, 
      role: 'business' 
    });

    if (!business) {
      throw new Error('Business not found! 🏢');
    }

    // Get plan details
    const plan = await SubscriptionPlan.findOne({ 
      name: planName, 
      isActive: true 
    });

    if (!plan) {
      throw new Error('Invalid subscription plan! 📋');
    }

    // Calculate subscription period
    const periodStart = new Date(startDate);
    const periodEnd = new Date(startDate);
    periodEnd.setDate(periodEnd.getDate() + duration);

    // Create local subscription record
    const subscription = new Subscription({
      businessId,
      plan: planName,
      status: 'active',
      billing: {
        cycle: billingCycle,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      },
      // Add initial payment to history
      paymentHistory: [{
        amount: paymentAmount || plan.price.amount,
        currency: currency,
        date: new Date(),
        status: paymentStatus,
        invoiceUrl: null // No Stripe invoice for manual payments
      }],
      // Initialize usage stats
      usage: {
        couponsCreated: 0,
        qrCodesGenerated: 0,
        totalRedemptions: 0
      }
    });

    await subscription.save({ session });

    // Update business user
    await User.findByIdAndUpdate(businessId, {
      subscription: {
        plan: planName,
        status: 'active',
        currentPeriodEnd: periodEnd
      }
    }, { session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Manual subscription created successfully! 🎉',
      data: {
        subscription,
        business: {
          id: business._id,
          name: business.businessProfile?.businessName,
          email: business.email
        },
        plan: {
          name: plan.name,
          features: plan.features
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    handleError(error, res);
  } finally {
    session.endSession();
  }
};

// Update subscription plan 🔄
const updateSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { businessId } = req.params;
    const { newPlanName, billingCycle } = req.body;

    // Get current subscription
    const subscription = await Subscription.findOne({ businessId });
    if (!subscription) {
      throw new Error('No active subscription found! 🔍');
    }

    // Get new plan details
    const newPlan = await SubscriptionPlan.findOne({ 
      name: newPlanName, 
      isActive: true 
    });
    if (!newPlan) {
      throw new Error('Invalid subscription plan! 📋');
    }

    // Update Stripe subscription
    // const stripeSubscription = await stripe.subscriptions.retrieve(
    //   subscription.stripeSubscriptionId
    // );

    // await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    //   items: [{
    //     id: stripeSubscription.items.data[0].id,
    //     price: billingCycle === 'yearly' ? 
    //       newPlan.price.yearlyPriceId : 
    //       newPlan.price.monthlyPriceId
    //   }],
    //   proration_behavior: 'always_invoice'
    // });

    // Update local subscription
    subscription.plan = newPlanName;
    subscription.billing.cycle = billingCycle;
    await subscription.save({ session });

    // Update business user
    await User.findByIdAndUpdate(businessId, {
      'subscription.plan': newPlanName
    }, { session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: subscription
    });

  } catch (error) {
    await session.abortTransaction();
    handleError(error, res);
  } finally {
    session.endSession();
  }
};

// Cancel subscription ❌
const cancelSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { businessId } = req.params;
    const { cancelImmediately = false } = req.body;

    // Get subscription
    const subscription = await Subscription.findOne({ businessId });
    if (!subscription) {
      throw new Error('No active subscription found! 🔍');
    }

    // Cancel in Stripe
    // if (cancelImmediately) {
    //   await stripe.subscriptions.del(subscription.stripeSubscriptionId);
    // } else {
    //   await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    //     cancel_at_period_end: true
    //   });
    // }

    // Update local subscription
    subscription.status = cancelImmediately ? 'canceled' : 'active';
    subscription.billing.cancelAtPeriodEnd = !cancelImmediately;
    await subscription.save({ session });

    // Update business user
    await User.findByIdAndUpdate(businessId, {
      'subscription.status': subscription.status
    }, { session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: cancelImmediately ? 
        'Subscription cancelled immediately! 🛑' : 
        'Subscription will be cancelled at the end of billing period! ⏳',
      data: subscription
    });

  } catch (error) {
    await session.abortTransaction();
    handleError(error, res);
  } finally {
    session.endSession();
  }
};

// Handle Stripe webhook events 🎣
const handleStripeWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        await handleSuccessfulPayment(invoice);
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        await handleFailedPayment(failedInvoice);
        break;
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ 
      success: false,
      message: 'Webhook error! 🚫',
      error: error.message 
    });
  }
};

// Helper function to handle subscription updates
const handleSubscriptionUpdate = async (stripeSubscription) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: stripeSubscription.id 
    });

    if (subscription) {
      // Update subscription status
      subscription.status = stripeSubscription.status;
      subscription.billing.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
      subscription.billing.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      subscription.billing.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
      await subscription.save({ session });

      // Update business user
      await User.findByIdAndUpdate(subscription.businessId, {
        'subscription.status': stripeSubscription.status,
        'subscription.currentPeriodEnd': new Date(stripeSubscription.current_period_end * 1000)
      }, { session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Helper function to handle successful payments
const handleSuccessfulPayment = async (invoice) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const subscription = await Subscription.findOne({ 
      stripeCustomerId: invoice.customer 
    });

    if (subscription) {
      // Add payment to history
      subscription.paymentHistory.push({
        amount: invoice.amount_paid / 100, // Convert from cents
        currency: invoice.currency,
        date: new Date(invoice.created * 1000),
        status: 'succeeded',
        invoiceUrl: invoice.hosted_invoice_url
      });
      await subscription.save({ session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Helper function to handle failed payments
const handleFailedPayment = async (invoice) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const subscription = await Subscription.findOne({ 
      stripeCustomerId: invoice.customer 
    });

    if (subscription) {
      // Update subscription status
      subscription.status = 'past_due';
      subscription.paymentHistory.push({
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        date: new Date(invoice.created * 1000),
        status: 'failed',
        invoiceUrl: invoice.hosted_invoice_url
      });
      await subscription.save({ session });

      // Update business user
      await User.findByIdAndUpdate(subscription.businessId, {
        'subscription.status': 'past_due'
      }, { session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Get all subscriptions with filters 📋
const getAllSubscriptions = async (req, res) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 10,
      
      // Search filters
      search,
      searchFields = ["businessId"],
      
      // Status filters
      status,
      plan,
      
      // Date filters
      startDate,
      endDate,
      
      // Sort
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build base query 🏗️
    const query = {};

    // Add search filter 🔍
    if (search) {
      query.$or = [
        { businessId: mongoose.Types.ObjectId.isValid(search) ? new mongoose.Types.ObjectId(search) : null },
        { plan: new RegExp(search, "i") }
      ];
    }

    // Add status filter
    if (status) {
      query.status = status;
    }

    // Add plan filter
    if (plan) {
      query.plan = plan;
    }

    // Add date filters 📅
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

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
                status: "$businessProfile.status"
              }
            }
          ],
          as: "businessDetails"
        }
      },
      
      // Lookup plan details
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "plan",
          foreignField: "name",
          as: "planDetails"
        }
      },
      
      // Add computed fields
      {
        $addFields: {
          businessInfo: { $arrayElemAt: ["$businessDetails", 0] },
          planInfo: { $arrayElemAt: ["$planDetails", 0] },
          isActive: {
            $and: [
              { $eq: ["$status", "active"] },
              { $gt: ["$billing.currentPeriodEnd", new Date()] }
            ]
          },
          daysRemaining: {
            $ceil: {
              $divide: [
                { $subtract: ["$billing.currentPeriodEnd", new Date()] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          totalRevenue: {
            $reduce: {
              input: "$paymentHistory",
              initialValue: 0,
              in: { 
                $add: [
                  "$$value",
                  { $cond: [
                    { $eq: ["$$this.status", "succeeded"] },
                    "$$this.amount",
                    0
                  ]}
                ]
              }
            }
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
    const [subscriptions, totalCount] = await Promise.all([
      Subscription.aggregate(pipeline),
      Subscription.countDocuments(query)
    ]);

    // Format response
    const formattedSubscriptions = subscriptions.map(sub => ({
      id: sub._id,
      business: sub.businessInfo ? {
        id: sub.businessInfo._id,
        name: sub.businessInfo.businessName,
        email: sub.businessInfo.email,
        phoneNumber: sub.businessInfo.phoneNumber,
        status: sub.businessInfo.status
      } : null,
      subscription: {
        plan: sub.plan,
        status: sub.status,
        isActive: sub.isActive,
        daysRemaining: sub.daysRemaining,
        billing: {
          cycle: sub.billing.cycle,
          currentPeriodStart: sub.billing.currentPeriodStart,
          currentPeriodEnd: sub.billing.currentPeriodEnd,
          cancelAtPeriodEnd: sub.billing.cancelAtPeriodEnd
        }
      },
      planDetails: sub.planInfo ? {
        name: sub.planInfo.name,
        description: sub.planInfo.description,
        price: sub.planInfo.price,
        features: sub.planInfo.features
      } : null,
      usage: sub.usage,
      metrics: {
        totalRevenue: sub.totalRevenue,
        successfulPayments: sub.paymentHistory.filter(p => p.status === 'succeeded').length,
        failedPayments: sub.paymentHistory.filter(p => p.status === 'failed').length
      },
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    }));

    // Calculate summary statistics
    const summary = {
      total: totalCount,
      filtered: subscriptions.length,
      status: {
        active: formattedSubscriptions.filter(s => s.subscription.isActive).length,
        expired: formattedSubscriptions.filter(s => !s.subscription.isActive).length,
        cancelPending: formattedSubscriptions.filter(s => s.subscription.billing.cancelAtPeriodEnd).length
      },
      metrics: {
        totalRevenue: formattedSubscriptions.reduce((sum, s) => sum + s.metrics.totalRevenue, 0),
        avgRevenuePerSubscription: formattedSubscriptions.length ? 
          formattedSubscriptions.reduce((sum, s) => sum + s.metrics.totalRevenue, 0) / formattedSubscriptions.length : 0,
        successRate: formattedSubscriptions.reduce((sum, s) => sum + s.metrics.successfulPayments, 0) / 
          (formattedSubscriptions.reduce((sum, s) => sum + s.metrics.successfulPayments + s.metrics.failedPayments, 0) || 1) * 100
      },
      plans: formattedSubscriptions.reduce((acc, s) => {
        acc[s.subscription.plan] = (acc[s.subscription.plan] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: {
        subscriptions: formattedSubscriptions,
        summary,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pages: Math.ceil(totalCount / limit),
          hasMore: page < Math.ceil(totalCount / limit)
        },
        filters: {
          search: search || null,
          status: status || null,
          plan: plan || null,
          dates: {
            start: startDate || null,
            end: endDate || null
          }
        }
      }
    });

  } catch (error) {
    handleError(error, res);
  }
};

module.exports = {
  getAllPlans,
  getBusinessSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  createPlan,
  getAllSubscriptions
  // handleStripeWebhook
}; 