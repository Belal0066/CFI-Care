const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const documentReferenceController = require("./documentReferenceController");

// Get document references by patient ID (optional query params: ?type=...&category=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.getDocumentReferencesByPatient,
);

// Create document reference with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.createDocumentReferenceWithSpecificId,
);

// Create document reference (auto-generated ID)
router.post(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.createDocumentReference,
);

// Get document reference by ID
router.get(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.getDocumentReferenceById,
);

// Update document reference
router.post(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.updateDocumentReference,
);

// Delete document reference
router.delete(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  documentReferenceController.deleteDocumentReference,
);

module.exports = router;
