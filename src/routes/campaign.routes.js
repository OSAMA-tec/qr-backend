// Import dependencies 📦
const router = require("express").Router();
const {
  createCampaign,
  trackCampaignClick,
  submitCampaignForm,
  getCampaignAnalytics,
  getAllCampaigns,
} = require("../controllers/campaign.controller");

const authMiddleware = require("../middleware/auth.middleware");
const { csrfProtection } = require("../middleware/csrf.middleware");
const {
  campaignValidation,
  campaignFormValidation,
} = require("../middleware/validation.middleware");

// Custom middleware to check if user is business 🏢
const isBusinessMiddleware = (req, res, next) => {
  if (req.user.role !== "business") {
    return res.status(403).json({
      success: false,
      message:
        "Access denied! Only business accounts can access this resource 🚫",
    });
  }
  next();
};

// Public routes 🌐
router.get("/click/:referralCode", trackCampaignClick); // Track campaign click
router.post(
  "/submit",
  csrfProtection,
  campaignFormValidation,
  submitCampaignForm
); // Submit campaign form

// Protected business routes 🔒
router.use(authMiddleware);
router.use(isBusinessMiddleware);

router.post("/", csrfProtection, campaignValidation, createCampaign); // Create campaign
router.get("/", getAllCampaigns); // Get all campaigns for business
router.get("/:campaignId/analytics", getCampaignAnalytics); // Get campaign analytics

module.exports = router;
