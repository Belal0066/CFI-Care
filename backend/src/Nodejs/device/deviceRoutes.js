const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const deviceController = require("./deviceController");

// Get all devices
router.get("/", requireApiAuth, deviceController.getAllDevices);

// Get devices by organization
router.get(
  "/organization/:organizationId",
  requireApiAuth,
  deviceController.getDevicesByOrganization,
);

// Create device with specific ID
router.put("/", requireApiAuth, deviceController.createDeviceWithSpecificId);

// Create device (auto-generated ID)
router.post("/", requireApiAuth, deviceController.createDevice);

// Get device by ID
router.get("/:id", requireApiAuth, deviceController.getDeviceById);

// Update device
router.post("/:id", requireApiAuth, deviceController.updateDevice);

// Delete device
router.delete("/:id", requireApiAuth, deviceController.deleteDevice);

module.exports = router;
