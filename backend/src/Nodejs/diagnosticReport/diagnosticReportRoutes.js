const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const diagnosticReportController = require("./diagnosticReportController");

// Get diagnostic reports by patient ID (optional query param: ?category=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,
  diagnosticReportController.getDiagnosticReportsByPatient,
);

// Create diagnostic report with specific ID
router.put(
  "/",
  requireApiAuth,
  diagnosticReportController.createDiagnosticReportWithSpecificId,
);

// Create diagnostic report (auto-generated ID)
router.post(
  "/",
  requireApiAuth,
  diagnosticReportController.createDiagnosticReport,
);

// Get diagnostic report by ID
router.get(
  "/:id",
  requireApiAuth,
  diagnosticReportController.getDiagnosticReportById,
);

// Update diagnostic report
router.post(
  "/:id",
  requireApiAuth,
  diagnosticReportController.updateDiagnosticReport,
);

// Delete diagnostic report
router.delete(
  "/:id",
  requireApiAuth,
  diagnosticReportController.deleteDiagnosticReport,
);

module.exports = router;
