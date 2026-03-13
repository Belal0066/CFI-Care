const express = require("express");
const router = express.Router();
const documentReferenceController = require("./documentReferenceController");

// Get document references by patient ID (optional query params: ?type=...&category=...)
router.get(
  "/patient/:patientId",
  documentReferenceController.getDocumentReferencesByPatient,
);

// Create document reference with specific ID
router.put(
  "/",
  documentReferenceController.createDocumentReferenceWithSpecificId,
);

// Create document reference (auto-generated ID)
router.post("/", documentReferenceController.createDocumentReference);

// Get document reference by ID
router.get("/:id", documentReferenceController.getDocumentReferenceById);

// Update document reference
router.post("/:id", documentReferenceController.updateDocumentReference);

// Delete document reference
router.delete("/:id", documentReferenceController.deleteDocumentReference);

module.exports = router;
