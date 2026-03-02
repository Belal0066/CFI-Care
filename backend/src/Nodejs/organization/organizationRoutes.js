const express = require("express");
const router = express.Router();
// const { requireSession } = require("../middleware/requireSession");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const organizationController = require("./organizationController");

// Get all organizations
router.get("/", requireApiAuth, organizationController.getAllOrganizations);

// Create organization with specific ID
router.put(
  "/",
  requireApiAuth,
  organizationController.createOrganizationWithSpecificId,
);

// Create organization (auto-generated ID)
router.post("/", requireApiAuth, organizationController.createOrganization);

// Get organization by ID
router.get("/:id", requireApiAuth, organizationController.getOrganizationById);

// Update organization
router.post("/:id", requireApiAuth, organizationController.updateOrganization);

// Delete organization
router.delete(
  "/:id",
  requireApiAuth,
  organizationController.deleteOrganization,
);

module.exports = router;
