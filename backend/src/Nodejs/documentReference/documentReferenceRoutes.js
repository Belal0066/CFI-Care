const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const documentReferenceController = require("./documentReferenceController");

// Get document references by patient ID (optional query params: ?type=...&category=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,
  documentReferenceController.getDocumentReferencesByPatient,
);

// Create document reference with specific ID
router.put(
  "/",
  requireApiAuth,
  documentReferenceController.createDocumentReferenceWithSpecificId,
);

// Create document reference (auto-generated ID)
router.post(
  "/",
  requireApiAuth,
  documentReferenceController.createDocumentReference,
);

// Get document reference by ID
router.get(
  "/:id",
  requireApiAuth,
  documentReferenceController.getDocumentReferenceById,
);

// Update document reference
router.post(
  "/:id",
  requireApiAuth,
  documentReferenceController.updateDocumentReference,
);

// Delete document reference
router.delete(
  "/:id",
  requireApiAuth,
  documentReferenceController.deleteDocumentReference,
);

module.exports = router;
