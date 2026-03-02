const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const relatedPersonController = require("./relatedPersonController");

// Get all related persons
router.get("/", requireApiAuth, relatedPersonController.getAllRelatedPersons);

// Get related persons by patient
router.get(
  "/patient/:patientId",
  requireApiAuth,
  relatedPersonController.getRelatedPersonsByPatient,
);

// Create related person with specific ID
router.put(
  "/",
  requireApiAuth,
  relatedPersonController.createRelatedPersonWithSpecificId,
);

// Create related person (auto-generated ID)
router.post("/", requireApiAuth, relatedPersonController.createRelatedPerson);

// Get related person by ID
router.get(
  "/:id",
  requireApiAuth,
  relatedPersonController.getRelatedPersonById,
);

// Update related person
router.post(
  "/:id",
  requireApiAuth,
  relatedPersonController.updateRelatedPerson,
);

// Delete related person
router.delete(
  "/:id",
  requireApiAuth,
  relatedPersonController.deleteRelatedPerson,
);

module.exports = router;
