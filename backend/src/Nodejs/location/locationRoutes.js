const express = require("express");
const router = express.Router();
// const { requireSession } = require("../middleware/requireSession");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const locationController = require("./locationController");

// Get all locations
router.get("/", requireApiAuth, locationController.getAllLocations);

// Get locations by organization
router.get(
  "/organization/:organizationId",
  requireApiAuth,
  locationController.getLocationsByOrganization,
);

// Create location with specific ID
router.put(
  "/",
  requireApiAuth,
  locationController.createLocationWithSpecificId,
);

// Create location (auto-generated ID)
router.post("/", requireApiAuth, locationController.createLocation);

// Get location by ID
router.get("/:id", requireApiAuth, locationController.getLocationById);

// Update location
router.post("/:id", requireApiAuth, locationController.updateLocation);

// Delete location
router.delete("/:id", requireApiAuth, locationController.deleteLocation);

module.exports = router;
