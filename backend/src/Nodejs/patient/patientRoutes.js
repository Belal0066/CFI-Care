const express = require("express");
const router = express.Router();

const patientController = require("./patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");
const { requireSession } = require("../middleware/requireSession");

// GET all patients
router.get("/", requireSession, patientController.getAllPatients);
//Authz tokens
// const { verifyToken } = require("../middleware/keycloakJWT");
const { requireApiAuth } = require("../middleware/requireApiAuth");

//scopes
const requireScopes = require("../middleware/validateScopes");
const attachForwardedToken = require("../middleware/attachForwardedToken");
// const requireOwnership = require('../middleware/requireOwnership');

router.post(
  "/",
  validateRequest(createPatientSchema),
  patientController.createPatient,
);

router.put("/", patientController.createPatientWithSpecificId);

// Sync patient to FHIR (create FHIR Patient from mobile app user data)
router.post("/sync-fhir", patientController.syncPatientToFHIR);

router.get(
  "/toon-everything/:id",
  requireSession,
  attachForwardedToken,
  patientController.toonPatientEverything,
);
router.get(
  "/",
  requireSession,
  attachForwardedToken,
  patientController.getCurrentPatient,
);

router.put(
  "/:id",
  // validateRequest(createPatientSchema),
  attachForwardedToken,
  requireApiAuth,
  requireScopes(["patient/*.rs"]),
  patientController.createPatientWithSpecificId,
);

router.get(
  "/:id",
  requireSession,
  attachForwardedToken,
  requireApiAuth,
  requireScopes(["patient/*.rs"]),
  patientController.getPatientById,
);

//still need to add scopes :/
router.get(
  "/:id/related-data",
  requireSession,
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientAllRelatedData,
);
router.get(
  "/:id/observations",
  requireSession,
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientObservations,
);
router.get(
  "/:id/encounters",
  requireSession,
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientEncounters,
);

module.exports = router;
