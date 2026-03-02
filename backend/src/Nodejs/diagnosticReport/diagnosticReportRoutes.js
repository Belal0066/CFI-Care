const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const diagnosticReportController = require("./diagnosticReportController");

// Get diagnostic reports by patient ID (optional query param: ?category=...)
router.get(
  "/patient/:patientId",
  requireSession,
  diagnosticReportController.getDiagnosticReportsByPatient,
);

// Create diagnostic report with specific ID
router.put(
  "/",
  requireSession,
  diagnosticReportController.createDiagnosticReportWithSpecificId,
);

// Create diagnostic report (auto-generated ID)
router.post(
  "/",
  requireSession,
  diagnosticReportController.createDiagnosticReport,
);

// Get diagnostic report by ID
router.get(
  "/:id",
  requireSession,
  diagnosticReportController.getDiagnosticReportById,
);

// Update diagnostic report
router.post(
  "/:id",
  requireSession,
  diagnosticReportController.updateDiagnosticReport,
);

// Delete diagnostic report
router.delete(
  "/:id",
  requireSession,
  diagnosticReportController.deleteDiagnosticReport,
);

module.exports = router;
