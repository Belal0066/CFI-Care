const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const healthcareServiceController = require("./healthcareServiceController");

// Get all healthcare services
router.get(
  "/",
  requireSession,
  healthcareServiceController.getAllHealthcareServices,
);

// Get healthcare services by organization
router.get(
  "/organization/:organizationId",
  requireSession,
  healthcareServiceController.getHealthcareServicesByOrganization,
);

// Create healthcare service with specific ID
router.put(
  "/",
  requireSession,
  healthcareServiceController.createHealthcareServiceWithSpecificId,
);

// Create healthcare service (auto-generated ID)
router.post(
  "/",
  requireSession,
  healthcareServiceController.createHealthcareService,
);

// Get healthcare service by ID
router.get(
  "/:id",
  requireSession,
  healthcareServiceController.getHealthcareServiceById,
);

// Update healthcare service
router.post(
  "/:id",
  requireSession,
  healthcareServiceController.updateHealthcareService,
);

// Delete healthcare service
router.delete(
  "/:id",
  requireSession,
  healthcareServiceController.deleteHealthcareService,
);

module.exports = router;
