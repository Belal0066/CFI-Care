const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const observationController = require("./observationController");


// Get observations by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  observationController.getObservationsByPatient,
);

// Get observations that belong to a specific DiagnosticReport.
// Resolves result[] references from the DiagnosticReport and batch-fetches
// the corresponding Observations in a single HAPI FHIR call.
router.get(
  "/diagnostic-report/:diagnosticReportId",
  requireApiAuth,
  observationController.getObservationsByDiagnosticReport,
);

// Get observations by patient ID and category (query param: ?category=vital-signs)
router.get(
  "/patient/:patientId/category",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  observationController.getObservationsByCategory,
);

// Create observation with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  observationController.createObservationWithSpecificId,
);

// Create observation (auto-generated ID)
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), observationController.createObservation);

// Get observation by ID
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), observationController.getObservationById);

// Update observation
router.post("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), observationController.updateObservation);

// Delete observation
router.delete("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), observationController.deleteObservation);

module.exports = router;
