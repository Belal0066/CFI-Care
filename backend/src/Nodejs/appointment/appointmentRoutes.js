const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const appointmentController = require("./appointmentController");

// Get appointments by patient ID
router.get(
  "/patient/:patientId",
  appointmentController.getAppointmentsByPatient,
);

// Get appointments by practitioner ID
router.get(
  "/practitioner/:practitionerId",
  requireSession,
  appointmentController.getAppointmentsByPractitioner,
);

// Create appointment with specific ID
router.put(
  "/",
  requireSession,
  appointmentController.createAppointmentWithSpecificId,
);

// Create appointment (auto-generated ID)
router.post("/", appointmentController.createAppointment);

// Get appointment by ID
router.get("/:id", requireSession, appointmentController.getAppointmentById);

// Update appointment
router.post("/:id", appointmentController.updateAppointment);

// Delete appointment
router.delete("/:id", requireSession, appointmentController.deleteAppointment);

module.exports = router;
