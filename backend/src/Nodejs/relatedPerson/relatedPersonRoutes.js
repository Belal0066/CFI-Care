const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const relatedPersonController = require("./relatedPersonController");

// Get all related persons
router.get("/", requireSession, relatedPersonController.getAllRelatedPersons);

// Get related persons by patient
router.get(
  "/patient/:patientId",
  requireSession,
  relatedPersonController.getRelatedPersonsByPatient,
);

// Create related person with specific ID
router.put(
  "/",
  requireSession,
  relatedPersonController.createRelatedPersonWithSpecificId,
);

// Create related person (auto-generated ID)
router.post("/", requireSession, relatedPersonController.createRelatedPerson);

// Get related person by ID
router.get(
  "/:id",
  requireSession,
  relatedPersonController.getRelatedPersonById,
);

// Update related person
router.post(
  "/:id",
  requireSession,
  relatedPersonController.updateRelatedPerson,
);

// Delete related person
router.delete(
  "/:id",
  requireSession,
  relatedPersonController.deleteRelatedPerson,
);

module.exports = router;
