const express = require("express");
const router = express.Router();
const procedureController = require("./procedureController");

// Create a new procedure
router.post("/", procedureController.createProcedure);

// Get procedure by ID
router.get("/:procedureId", procedureController.getProcedureById);

// Update procedure
router.put("/:procedureId", procedureController.updateProcedure);

// Delete procedure
router.delete("/:procedureId", procedureController.deleteProcedure);

// Get all procedures for a patient (must be last to avoid matching other routes)
router.get("/patient/:patientId", procedureController.getProceduresByPatientId);

module.exports = router;
