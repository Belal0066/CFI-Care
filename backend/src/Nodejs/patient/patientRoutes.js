const express = require("express");
const router = express.Router();

const patientController = require("./patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");

//Authz tokens 
const { verifyToken } = require('../middleware/keycloakJWT');

//scopes
const requireScopes = require('../middleware/validateScopes');
const attachForwardedToken = require('../middleware/attachForwardedToken');
// const requireOwnership = require('../middleware/requireOwnership');






router.post(
  "/",
  validateRequest(createPatientSchema),
  patientController.createPatient
);

router.get('/', attachForwardedToken, patientController.getCurrentPatient);

router.put(
  "/:id",
  // validateRequest(createPatientSchema),
  attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), requireScopes(['patient/*.rw']),
  patientController.createPatientWithSpecificId
);




router.get("/:id", attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), requireScopes(['patient/*.rs']), patientController.getPatientById);

//still need to add scopes :/
router.get("/:id/related-data",attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientAllRelatedData);
router.get("/:id/observations", attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientObservations);
router.get("/:id/encounters", attachForwardedToken,verifyToken(process.env.EXPECTED_AUDIENCE), patientController.getPatientEncounters);

module.exports = router;
