const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");
const compositionController = require("./compositionController");

// Get compositions by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  compositionController.getCompositionsByPatient,
);

// Get composition (and its AI summary) for a specific DocumentReference.
// Called by the mobile after a document upload completes to show the
// AI-generated summary alongside the document.
router.get(
  "/document/:documentReferenceId",
  requireApiAuth,
  compositionController.getCompositionByDocumentReference,
);

// Get composition by ID
router.get(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  compositionController.getCompositionById,
);

module.exports = router;
