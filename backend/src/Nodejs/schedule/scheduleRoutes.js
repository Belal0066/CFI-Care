const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const scheduleController = require("./scheduleController");

// Get schedules by actor (e.g., Practitioner/123)
router.get(
  "/actor/:actorReference",
  requireSession,
  scheduleController.getSchedulesByActor,
);

// Create schedule with specific ID
router.put(
  "/",
  requireSession,
  scheduleController.createScheduleWithSpecificId,
);

// Create schedule (auto-generated ID)
router.post("/", requireSession, scheduleController.createSchedule);

// Get schedule by ID
router.get("/:id", requireSession, scheduleController.getScheduleById);

// Update schedule
router.post("/:id", requireSession, scheduleController.updateSchedule);

// Delete schedule
router.delete("/:id", requireSession, scheduleController.deleteSchedule);

module.exports = router;
