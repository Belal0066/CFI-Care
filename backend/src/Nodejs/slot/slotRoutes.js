const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const slotController = require("./slotController");

// Get slots by schedule ID (optional status query param: ?status=free)
router.get("/schedule/:scheduleId", slotController.getSlotsBySchedule);

// Get slots for a specific practitioner 
router.get(
  "/practitioner/:practitionerId",
  slotController.getSlotsByPractitioner,
);

// Get available slots for practitioner (query params: ?date=2026-02-15&scheduleId=123)
router.get("/available/:practitionerId", slotController.getAvailableSlots);

// Create slot with specific ID
router.put("/", slotController.createSlotWithSpecificId);

// Create slot (auto-generated ID)
router.post("/", slotController.createSlot);

// Get slot by ID
router.get("/:id", slotController.getSlotById);

// Update slot
router.post("/:id", slotController.updateSlot);

// Delete slot
router.delete("/:id", slotController.deleteSlot);

module.exports = router;
