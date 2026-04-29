const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const slotController = require("./slotController");

// Get slots by schedule ID (optional status query param: ?status=free)
router.get("/schedule/:scheduleId", requireApiAuth, slotController.getSlotsBySchedule);

// Get free slots for a specific practitioner
router.get(
  "/practitioner/:practitionerId", requireApiAuth,
  slotController.getSlotsByPractitioner,
);

// Get available slots for practitioner (query params: ?date=2026-02-15&scheduleId=123)
router.get("/available/:practitionerId", requireApiAuth, slotController.getAvailableSlots);

// Create slot with specific ID
router.put("/", requireApiAuth, slotController.createSlotWithSpecificId);

// Create slot (auto-generated ID)
router.post("/", requireApiAuth, slotController.createSlot);

// Get slot by ID
router.get("/:id", requireApiAuth, slotController.getSlotById);

// Update slot
router.post("/:id", requireApiAuth, slotController.updateSlot);

// Delete slot
router.delete("/:id", requireApiAuth, slotController.deleteSlot);

module.exports = router;
