const express = require("express");
const router = express.Router();

const patientController = require("./patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");

router.post(
  "/",
  validateRequest(createPatientSchema),
  patientController.createPatient
);

router.put("/", patientController.createPatientWithSpecificId);

router.get("/:id", patientController.getPatientById);
router.get("/:id/related-data", patientController.getPatientAllRelatedData);
router.get("/:id/observations", patientController.getPatientObservations);
router.get("/:id/encounters", patientController.getPatientEncounters);

module.exports = router;
