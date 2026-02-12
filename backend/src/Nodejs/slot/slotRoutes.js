const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const slotController = require("./slotController");

// Get slots by schedule ID (optional status query param: ?status=free)
router.get(
  "/schedule/:scheduleId",
  requireSession,
  slotController.getSlotsBySchedule,
);

// Get available slots for practitioner (query params: ?date=2026-02-15&scheduleId=123)
router.get(
  "/available/:practitionerId",
  requireSession,
  slotController.getAvailableSlots,
);

// Create slot with specific ID
router.put("/", requireSession, slotController.createSlotWithSpecificId);

// Create slot (auto-generated ID)
router.post("/", requireSession, slotController.createSlot);

// Get slot by ID
router.get("/:id", requireSession, slotController.getSlotById);

// Update slot
router.post("/:id", requireSession, slotController.updateSlot);

// Delete slot
router.delete("/:id", requireSession, slotController.deleteSlot);

module.exports = router;
