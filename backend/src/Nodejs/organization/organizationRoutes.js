const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const organizationController = require("./organizationController");

// Get all organizations
router.get("/", requireSession, organizationController.getAllOrganizations);

// Create organization with specific ID
router.put(
  "/",
  requireSession,
  organizationController.createOrganizationWithSpecificId,
);

// Create organization (auto-generated ID)
router.post("/", requireSession, organizationController.createOrganization);

// Get organization by ID
router.get("/:id", requireSession, organizationController.getOrganizationById);

// Update organization
router.post("/:id", requireSession, organizationController.updateOrganization);

// Delete organization
router.delete(
  "/:id",
  requireSession,
  organizationController.deleteOrganization,
);

module.exports = router;
