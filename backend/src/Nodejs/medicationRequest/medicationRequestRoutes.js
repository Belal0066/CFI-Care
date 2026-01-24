const express = require("express");
const router = express.Router();

const medicationRequestController = require("./medicationRequestController");

// Get medication requests by patient ID
router.get(
  "/patient/:patientId",
  medicationRequestController.getMedicationRequestsByPatientId,
);

// Get medication requests by patient ID and status
router.get(
  "/patient/:patientId/status/:status",
  medicationRequestController.getMedicationRequestsByStatus,
);

// Get medication requests by encounter ID
router.get(
  "/encounter/:encounterId",
  medicationRequestController.getMedicationRequestsByEncounterId,
);

// Get medication requests by practitioner ID (prescriber)
router.get(
  "/practitioner/:practitionerId",
  medicationRequestController.getMedicationRequestsByPractitionerId,
);

// Get medication request by ID
router.get("/:id", medicationRequestController.getMedicationRequestById);

// Create medication request with specific ID
router.put(
  "/",
  medicationRequestController.createMedicationRequestWithSpecificId,
);

// Update medication request
router.post("/:id", medicationRequestController.updateMedicationRequest);

// Delete medication request
router.delete("/:id", medicationRequestController.deleteMedicationRequest);

module.exports = router;
