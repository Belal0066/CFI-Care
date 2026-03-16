const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const appointmentController = require("./appointmentController");

// Get appointments by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  appointmentController.getAppointmentsByPatient,
);

// Get appointments by practitioner ID
router.get(
  "/practitioner/:practitionerId",
  requireApiAuth,
  appointmentController.getAppointmentsByPractitioner,
);

// Create appointment with specific ID
router.put(
  "/",
  requireApiAuth,
  appointmentController.createAppointmentWithSpecificId,
);

// Create appointment (auto-generated ID)
router.post("/", appointmentController.createAppointment);

// Get appointment by ID
router.get("/:id", requireApiAuth, appointmentController.getAppointmentById);

// Update appointment
router.post("/:id", requireApiAuth, appointmentController.updateAppointment);

// Delete appointment
router.delete("/:id", requireApiAuth, appointmentController.deleteAppointment);

module.exports = router;
