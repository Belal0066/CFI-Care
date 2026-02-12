const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const locationController = require("./locationController");

// Get all locations
router.get("/", requireSession, locationController.getAllLocations);

// Get locations by organization
router.get(
  "/organization/:organizationId",
  requireSession,
  locationController.getLocationsByOrganization,
);

// Create location with specific ID
router.put(
  "/",
  requireSession,
  locationController.createLocationWithSpecificId,
);

// Create location (auto-generated ID)
router.post("/", requireSession, locationController.createLocation);

// Get location by ID
router.get("/:id", requireSession, locationController.getLocationById);

// Update location
router.post("/:id", requireSession, locationController.updateLocation);

// Delete location
router.delete("/:id", requireSession, locationController.deleteLocation);

module.exports = router;
