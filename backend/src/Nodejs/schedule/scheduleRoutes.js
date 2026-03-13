const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const scheduleController = require("./scheduleController");

// Get schedules by practitioner ID
router.get(
  "/practitioner/:practitionerId",
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

  scheduleController.getSchedulesByActor,
);

// Create schedule with specific ID
router.put(
  "/",

  scheduleController.createScheduleWithSpecificId,
);

// Create schedule (auto-generated ID)
router.post("/", scheduleController.createSchedule);

// Get schedule by ID
router.get("/:id", scheduleController.getScheduleById);

// Update schedule (PUT)
router.put("/:id", scheduleController.updateSchedule);

// Update schedule (POST) - alternative method for updates
router.post("/:id", scheduleController.updateSchedule);

// Delete schedule
router.delete("/:id", scheduleController.deleteSchedule);

module.exports = router;
