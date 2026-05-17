const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const relatedPersonController = require("./relatedPersonController");

// Get all related persons
router.get("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), relatedPersonController.getAllRelatedPersons);

// Get related persons by patient
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  relatedPersonController.getRelatedPersonsByPatient,
);

// Create related person with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  relatedPersonController.createRelatedPersonWithSpecificId,
);

// Create related person (auto-generated ID)
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), relatedPersonController.createRelatedPerson);

// Get related person by ID
router.get(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  relatedPersonController.getRelatedPersonById,
);

// Update related person
router.post(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  relatedPersonController.updateRelatedPerson,
);

// Delete related person
router.delete(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  relatedPersonController.deleteRelatedPerson,
);

module.exports = router;
