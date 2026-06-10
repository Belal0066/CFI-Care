const express = require("express");
const router = express.Router();

const medicationRequestController = require("./medicationRequestController");

const { requirePatientContext } = require("../middleware/requirePatientContext");
const { requireApiAuth } = require("../middleware/requireApiAuth");

// Get medication requests by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  medicationRequestController.getMedicationRequestsByPatientId,
);

// Get medication requests by patient ID and status
router.get(
  "/patient/:patientId/status/:status",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  medicationRequestController.getMedicationRequestsByStatus,
);

// Get medication requests by encounter ID
router.get(
  "/encounter/:encounterId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  medicationRequestController.getMedicationRequestsByEncounterId,
);

// Get medication requests by practitioner ID (prescriber)
router.get(
  "/practitioner/:practitionerId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  medicationRequestController.getMedicationRequestsByPractitionerId,
);

// Get medication request by ID
router.get("/:id",requireApiAuth,requirePatientContext({ paramName: "patientId" }), medicationRequestController.getMedicationRequestById);

// Create medication request with specific ID
router.put(
  "/", 
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  medicationRequestController.createMedicationRequestWithSpecificId,
);

// Update medication request
router.post("/:id",requireApiAuth,requirePatientContext({ paramName: "patientId" }), medicationRequestController.updateMedicationRequest);

// Delete medication request
router.delete("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), medicationRequestController.deleteMedicationRequest);

module.exports = router;
