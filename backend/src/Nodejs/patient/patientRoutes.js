const express = require("express");
const router = express.Router();

const patientController = require("./patientController");

const validateRequest = require("../middleware/validateRequest");
const { createPatientSchema } = require("../models/patientValidation");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

// GET all patients
router.get("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), patientController.getAllPatients);
//Authz tokens
// const { verifyToken } = require("../middleware/keycloakJWT");
// const { requireApiAuth } = require("../middleware/requireApiAuth");

//scopes
const requireScopes = require("../middleware/validateScopes");
const attachForwardedToken = require("../middleware/attachForwardedToken");
// const requireOwnership = require('../middleware/requireOwnership');

router.post(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  validateRequest(createPatientSchema),
  patientController.createPatient,
);

router.put("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), patientController.createPatientWithSpecificId);

// Sync patient to FHIR (create FHIR Patient from mobile app user data)
// router.post("/sync-fhir", requireApiAuth, patientController.syncPatientToFHIR);

router.get(
  "/toon-everything/:id",
  requireApiAuth,requirePatientContext({ paramName: "id" }),
  attachForwardedToken,
  patientController.toonPatientEverything,
);
router.get(
  "/me",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  attachForwardedToken,
  patientController.getCurrentPatient,
);

router.put(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "id" }),
  patientController.createPatientWithSpecificId,
);

router.get(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "id" }),
  attachForwardedToken,
  requireApiAuth,
  requireScopes(["patient/*.rs"]),
  patientController.getPatientById,
);

//still need to add scopes :/
router.get(
  "/:id/related-data",
  requireApiAuth,requirePatientContext({ paramName: "id" }),
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientAllRelatedData,
);
router.get(
  "/:id/observations",
  requireApiAuth,requirePatientContext({ paramName: "id" }),
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientObservations,
);
router.get(
  "/:id/encounters",
  requireApiAuth,requirePatientContext({ paramName: "id" }),
  attachForwardedToken,
  requireApiAuth,
  patientController.getPatientEncounters,
);

module.exports = router;
