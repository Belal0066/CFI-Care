const express = require("express");
const router = express.Router();

const patientController = require("../controllers/patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");

//Authz tokens 
// const { verifyToken } = require('../middleware/keycloakJWT');
// router.use(verifyToken(process.env.EXPECTED_AUDIENCE));

//scopes
const requireScopes = require('../middleware/validateScopes');
const attachForwardedToken = require('../middleware/attachForwardedToken');
// const requireOwnership = require('../middleware/requireOwnership');






router.post(
  "/",
  validateRequest(createPatientSchema),
  patientController.createPatient
);



router.get("/:id", attachForwardedToken, requireScopes(['patient/*.rs']), patientController.getPatientById);

//still need to add these scopes :/
router.get("/:id/related-data", patientController.getPatientAllRelatedData);
router.get("/:id/observations", patientController.getPatientObservations);
router.get("/:id/encounters", patientController.getPatientEncounters);

module.exports = router;
