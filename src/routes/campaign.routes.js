// Import dependencies 📦
const router = require("express").Router();
const {
  createCampaign,
  trackCampaignClick,
  submitCampaignForm,
  getCampaignAnalytics,
  getAllCampaigns,
  submitCampaignAnswer,
  updateCampaignQuestion,
  getCampaignAnswers,
  updateCampaign
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
router.get("/ref/:referralCode", trackCampaignClick); // Track campaign click
router.post(
  "/submit",
  campaignFormValidation,
  submitCampaignForm
); // Submit campaign form
// Answer submission route (for customers)
router.post("/:campaignId/answer", submitCampaignAnswer);

// Protected routes for both business and customers 🔒
router.use(authMiddleware);


// Protected business routes 🔒
router.use(isBusinessMiddleware);

router.post("/", createCampaign); // Create campaign
router.get("/", getAllCampaigns); // Get all campaigns for business
router.get("/:campaignId/analytics", getCampaignAnalytics); // Get campaign analytics

// Update campaign route
router.put("/:campaignId", updateCampaign); // Update campaign details

// Question and Answer routes (for business)
router.put("/:campaignId/question", updateCampaignQuestion); // Update campaign question
router.get("/:campaignId/answers", getCampaignAnswers); // Get campaign answers

module.exports = router;
