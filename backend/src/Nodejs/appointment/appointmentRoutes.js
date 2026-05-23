const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const appointmentController = require("./appointmentController");

// Get appointments by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
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
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  appointmentController.createAppointmentWithSpecificId,
);

// Create appointment (auto-generated ID)
router.post("/", appointmentController.createAppointment);

// Get appointment by ID
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), appointmentController.getAppointmentById);

// Update appointment
router.post("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), appointmentController.updateAppointment);

// Delete appointment
router.delete("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), appointmentController.deleteAppointment);

module.exports = router;
