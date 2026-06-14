const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const scheduleController = require("./scheduleController");

// Get schedules by practitioner ID
router.get(
  "/practitioner/:practitionerId", requireApiAuth,
  scheduleController.getSchedulesByPractitioner,
);

// Get schedules with their slots by practitioner ID 
router.get(
  "/practitioner/:practitionerId/with-slots",
  scheduleController.getSchedulesWithSlotsByPractitioner,
);

// Get schedules by actor (e.g., Practitioner/123)
router.get(
  "/actor/:actorReference",
  requireApiAuth,
  scheduleController.getSchedulesByActor,
);

// Create schedule with specific ID
router.put(
  "/",
  requireApiAuth,
  scheduleController.createScheduleWithSpecificId,
);

// Create schedule (auto-generated ID)
router.post("/", requireApiAuth, scheduleController.createSchedule);

// Get schedule by ID
router.get("/:id", requireApiAuth, scheduleController.getScheduleById);

// Update schedule (PUT)
router.put("/:id", requireApiAuth, scheduleController.updateSchedule);

// Update schedule (POST) - alternative method for updates
router.post("/:id", requireApiAuth, scheduleController.updateSchedule);

// Delete schedule
router.delete("/:id", requireApiAuth, scheduleController.deleteSchedule);

module.exports = router;
