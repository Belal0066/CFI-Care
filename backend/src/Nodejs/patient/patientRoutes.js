const express = require("express");
const router = express.Router();

const patientController = require("./patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");

// GET all patients
router.get("/", patientController.getAllPatients);
//Authz tokens 
const { verifyToken } = require('../middleware/keycloakJWT');

//scopes
const requireScopes = require('../middleware/validateScopes');
const attachForwardedToken = require('../middleware/attachForwardedToken');
// const requireOwnership = require('../middleware/requireOwnership');
const { requireSession } = require('../middleware/requireSession');





router.post(
  "/",
  validateRequest(createPatientSchema),
  patientController.createPatient
);

router.put("/", patientController.createPatientWithSpecificId);

router.get("/toon-everything/:id", requireSession, attachForwardedToken, patientController.toonPatientEverything);
router.get('/', requireSession, attachForwardedToken, patientController.getCurrentPatient);

router.put(
  "/:id",
  // validateRequest(createPatientSchema),
  attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), requireScopes(['patient/*.rs']),
  patientController.createPatientWithSpecificId
);




router.get("/:id",requireSession ,attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), requireScopes(['patient/*.rs']), patientController.getPatientById);

//still need to add scopes :/
router.get("/:id/related-data",requireSession ,attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientAllRelatedData);
router.get("/:id/observations", requireSession ,attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientObservations);
router.get("/:id/encounters", requireSession ,attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientEncounters);

module.exports = router;
