const express = require("express");
const router = express.Router();
// const { requireSession } = require("../middleware/requireSession");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const healthcareServiceController = require("./healthcareServiceController");

// Get all healthcare services
router.get(
  "/",
  requireApiAuth,
  healthcareServiceController.getAllHealthcareServices,
);

// Get healthcare services by organization
router.get(
  "/organization/:organizationId",
  requireApiAuth,
  healthcareServiceController.getHealthcareServicesByOrganization,
);

// Create healthcare service with specific ID
router.put(
  "/",
  requireApiAuth,
  healthcareServiceController.createHealthcareServiceWithSpecificId,
);

// Create healthcare service (auto-generated ID)
router.post(
  "/",
  requireApiAuth,
  healthcareServiceController.createHealthcareService,
);

// Get healthcare service by ID
router.get(
  "/:id",
  requireApiAuth,
  healthcareServiceController.getHealthcareServiceById,
);

// Update healthcare service
router.post(
  "/:id",
  requireApiAuth,
  healthcareServiceController.updateHealthcareService,
);

// Delete healthcare service
router.delete(
  "/:id",
  requireApiAuth,
  healthcareServiceController.deleteHealthcareService,
);

module.exports = router;
