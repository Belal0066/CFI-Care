const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const documentReferenceController = require("./documentReferenceController");

// Get document references by patient ID (optional query params: ?type=...&category=...)
router.get(
  "/patient/:patientId",
  requireSession,
  documentReferenceController.getDocumentReferencesByPatient,
);

// Create document reference with specific ID
router.put(
  "/",
  requireSession,
  documentReferenceController.createDocumentReferenceWithSpecificId,
);

// Create document reference (auto-generated ID)
router.post(
  "/",
  requireSession,
  documentReferenceController.createDocumentReference,
);

// Get document reference by ID
router.get(
  "/:id",
  requireSession,
  documentReferenceController.getDocumentReferenceById,
);

// Update document reference
router.post(
  "/:id",
  requireSession,
  documentReferenceController.updateDocumentReference,
);

// Delete document reference
router.delete(
  "/:id",
  requireSession,
  documentReferenceController.deleteDocumentReference,
);

module.exports = router;
