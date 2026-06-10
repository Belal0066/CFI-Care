const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const diagnosticReportController = require("./diagnosticReportController");

// Get diagnostic reports by patient ID (optional query param: ?category=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.getDiagnosticReportsByPatient,
);

// Create diagnostic report with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.createDiagnosticReportWithSpecificId,
);

// Create diagnostic report (auto-generated ID)
router.post(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.createDiagnosticReport,
);

// Get diagnostic report by ID
router.get(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.getDiagnosticReportById,
);

// Update diagnostic report
router.post(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.updateDiagnosticReport,
);

// Delete diagnostic report
router.delete(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  diagnosticReportController.deleteDiagnosticReport,
);

module.exports = router;
