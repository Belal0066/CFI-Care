const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const deviceController = require("./deviceController");

// Get all devices
router.get("/", requireSession, deviceController.getAllDevices);

// Get devices by organization
router.get(
  "/organization/:organizationId",
  requireSession,
  deviceController.getDevicesByOrganization,
);

// Create device with specific ID
router.put("/", requireSession, deviceController.createDeviceWithSpecificId);

// Create device (auto-generated ID)
router.post("/", requireSession, deviceController.createDevice);

// Get device by ID
router.get("/:id", requireSession, deviceController.getDeviceById);

// Update device
router.post("/:id", requireSession, deviceController.updateDevice);

// Delete device
router.delete("/:id", requireSession, deviceController.deleteDevice);

module.exports = router;
