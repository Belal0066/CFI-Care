const express = require("express");
const router = express.Router();
const procedureController = require("./procedureController");

const { requirePatientContext } = require("../middleware/requirePatientContext");
const { requireApiAuth } = require("../middleware/requireApiAuth");

// Create a new procedure
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }),procedureController.createProcedure);

// Get procedure by ID
router.get("/:procedureId",requireApiAuth,requirePatientContext({ paramName: "patientId" }), procedureController.getProcedureById);

// Update procedure
router.put("/:procedureId", requireApiAuth,requirePatientContext({ paramName: "patientId" }),procedureController.updateProcedure);

// Delete procedure
router.delete("/:procedureId",requireApiAuth,requirePatientContext({ paramName: "patientId" }), procedureController.deleteProcedure);

// Get all procedures for a patient (must be last to avoid matching other routes)
router.get("/patient/:patientId",requireApiAuth,requirePatientContext({ paramName: "patientId" }), procedureController.getProceduresByPatientId);

module.exports = router;
