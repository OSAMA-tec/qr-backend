// Import dependencies 📦
const User = require('../models/user.model');
const Campaign = require('../models/campaign.model');

// Get business and campaign lookup data 🔍
const getLookupData = async (req, res) => {
  try {
    // Get all businesses with role 'business' 🏢
    const businesses = await User.find(
      { role: 'business' },
      {
        '_id': 1,
        'businessProfile.businessName': 1
      }
    ).lean();

    // Get all campaigns 📊
    const campaigns = await Campaign.find(
      {},
      {
        '_id': 1,
        'name': 1,
        'businessId': 1,
        'type': 1,
        'status': 1
      }
    ).lean();

    // Format response
    const formattedBusinesses = businesses.map(business => ({
      id: business._id,
      name: business.businessProfile?.businessName || 'Unnamed Business'
    }));

    const formattedCampaigns = campaigns.map(campaign => ({
      id: campaign._id,
      name: campaign.name,
      businessId: campaign.businessId,
      type: campaign.type,
      status: campaign.status
    }));

    res.json({
      success: true,
      data: {
        businesses: formattedBusinesses,
        campaigns: formattedCampaigns
      }
    });

  } catch (error) {
    console.error("Get lookup data error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch lookup data! 😢",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  getLookupData
}; 