// Import dependencies 📦
const mongoose = require('mongoose');

// Business Analytics Schema 📊
const businessAnalyticsSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  // Overall Stats 📈
  totalRevenue: {
    type: Number,
    default: 0
  },
  totalCustomers: {
    type: Number,
    default: 0
  },
  totalRedemptions: {
    type: Number,
    default: 0
  },
  totalQRScans: {
    type: Number,
    default: 0
  },
  totalMessagesSent: {
    type: Number,
    default: 0
  },

  // Monthly Stats 📅
  monthlyStats: [{
    month: Number,
    year: Number,
    revenue: {
      type: Number,
      default: 0
    },
    qrScans: {
      type: Number,
      default: 0
    },
    redemptions: {
      type: Number,
      default: 0
    },
    newCustomers: {
      type: Number,
      default: 0
    }
  }],

  // Customer Stats 👥
  customerStats: {
    active: {
      type: Number,
      default: 0
    },
    guest: {
      type: Number,
      default: 0
    },
    registered: {
      type: Number,
      default: 0
    }
  },

  // Device Analytics 📱
  deviceStats: {
    desktop: {
      type: Number,
      default: 0
    },
    mobile: {
      type: Number,
      default: 0
    },
    tablet: {
      type: Number,
      default: 0
    }
  },

  // Browser Analytics 🌐
  browserStats: {
    type: Map,
    of: Number,
    default: new Map()
  },

  // Voucher Analytics 🎫
  voucherStats: {
    totalVouchers: {
      type: Number,
      default: 0
    },
    activeVouchers: {
      type: Number,
      default: 0
    },
    totalClaims: {
      type: Number,
      default: 0
    },
    totalRedemptions: {
      type: Number,
      default: 0
    }
  },

  // Source Analytics 🎯
  sourceStats: {
    campaign: {
      type: Number,
      default: 0
    },
    popup: {
      type: Number,
      default: 0
    },
    qr: {
      type: Number,
      default: 0
    },
    widget: {
      type: Number,
      default: 0
    },
    direct: {
      type: Number,
      default: 0
    }
  },

  // Daily Stats History 📅
  dailyStats: [{
    date: {
      type: Date,
      required: true
    },
    revenue: {
      type: Number,
      default: 0
    },
    qrScans: {
      type: Number,
      default: 0
    },
    redemptions: {
      type: Number,
      default: 0
    },
    newCustomers: {
      type: Number,
      default: 0
    }
  }],

  dailyMessageStats: [{
    date: {
      type: Date,
      required: true
    },
    messagesSent: {
      type: Number,
      default: 0
    }
  }],

  messageLogs: [{
    messageSid: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, required: true },
    recipient: { type: String, required: true }
  }],

  // Last Updated
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes 📇
businessAnalyticsSchema.index({ 'monthlyStats.year': 1, 'monthlyStats.month': 1 });
businessAnalyticsSchema.index({ 'dailyStats.date': 1 });

// Helper Methods 🛠️

// Update monthly stats
businessAnalyticsSchema.methods.updateMonthlyStats = async function(year, month, updates) {
  const monthStats = this.monthlyStats.find(
    stats => stats.year === year && stats.month === month
  );

  if (monthStats) {
    Object.keys(updates).forEach(key => {
      monthStats[key] += updates[key];
    });
  } else {
    this.monthlyStats.push({
      year,
      month,
      ...updates
    });
  }
};

// Update daily stats
businessAnalyticsSchema.methods.updateDailyStats = async function(date, updates) {
  const dayStats = this.dailyStats.find(
    stats => stats.date.toDateString() === date.toDateString()
  );

  if (dayStats) {
    Object.keys(updates).forEach(key => {
      dayStats[key] += updates[key];
    });
  } else {
    this.dailyStats.push({
      date,
      ...updates
    });
  }
};

// Track revenue
businessAnalyticsSchema.methods.trackRevenue = async function(amount) {
  const now = new Date();
  this.totalRevenue += amount;
  await this.updateMonthlyStats(now.getFullYear(), now.getMonth() + 1, { revenue: amount });
  await this.updateDailyStats(now, { revenue: amount });
  this.lastUpdated = now;
};

// Track QR scan
businessAnalyticsSchema.methods.trackQRScan = async function() {
  const now = new Date();
  this.totalQRScans += 1;
  await this.updateMonthlyStats(now.getFullYear(), now.getMonth() + 1, { qrScans: 1 });
  await this.updateDailyStats(now, { qrScans: 1 });
  this.lastUpdated = now;
};

// Track redemption
businessAnalyticsSchema.methods.trackRedemption = async function() {
  const now = new Date();
  this.totalRedemptions += 1;
  await this.updateMonthlyStats(now.getFullYear(), now.getMonth() + 1, { redemptions: 1 });
  await this.updateDailyStats(now, { redemptions: 1 });
  this.lastUpdated = now;
};

// Track new customer
businessAnalyticsSchema.methods.trackNewCustomer = async function(isGuest = false) {
  const now = new Date();
  this.totalCustomers += 1;
  if (isGuest) {
    this.customerStats.guest += 1;
  } else {
    this.customerStats.registered += 1;
  }
  await this.updateMonthlyStats(now.getFullYear(), now.getMonth() + 1, { newCustomers: 1 });
  await this.updateDailyStats(now, { newCustomers: 1 });
  this.lastUpdated = now;
};

// Track device
businessAnalyticsSchema.methods.trackDevice = async function(deviceType) {
  if (this.deviceStats[deviceType] !== undefined) {
    this.deviceStats[deviceType] += 1;
  }
  this.lastUpdated = new Date();
};

// Track browser
businessAnalyticsSchema.methods.trackBrowser = async function(browser) {
  const browserKey = browser.toLowerCase();
  const currentCount = this.browserStats.get(browserKey) || 0;
  this.browserStats.set(browserKey, currentCount + 1);
  this.lastUpdated = new Date();
};

// Track source
businessAnalyticsSchema.methods.trackSource = async function(source) {
  if (this.sourceStats[source] !== undefined) {
    this.sourceStats[source] += 1;
  }
  this.lastUpdated = new Date();
};

// Update daily message stats
businessAnalyticsSchema.methods.updateDailyMessageStats = async function() {
  const today = new Date();
  const existingStat = this.dailyMessageStats.find(stat => stat.date.toDateString() === today.toDateString());

  if (existingStat) {
    existingStat.messagesSent += 1;
  } else {
    this.dailyMessageStats.push({ date: today, messagesSent: 1 });
  }

  this.lastUpdated = today;
};

// Create model 🏗️
const BusinessAnalytics = mongoose.model('BusinessAnalytics', businessAnalyticsSchema);

module.exports = BusinessAnalytics; 