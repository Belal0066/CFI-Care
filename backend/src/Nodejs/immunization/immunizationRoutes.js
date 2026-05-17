const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const immunizationController = require("./immunizationController");

// Get all immunizations
router.get("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), immunizationController.getAllImmunizations);

// Get immunizations by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  immunizationController.getImmunizationsByPatient,
);

// Create immunization with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  immunizationController.createImmunizationWithSpecificId,
);

// Create immunization (auto-generated ID)
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), immunizationController.createImmunization);

// Get immunization by ID
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), immunizationController.getImmunizationById);

// Update immunization
router.post("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), immunizationController.updateImmunization);

// Delete immunization
router.delete(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  immunizationController.deleteImmunization,
);

module.exports = router;
