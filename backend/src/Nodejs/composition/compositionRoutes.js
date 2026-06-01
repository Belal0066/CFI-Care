const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");
const compositionController = require("./compositionController");

// Get compositions by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  compositionController.getCompositionsByPatient,
);

// Get composition by ID
router.get(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  compositionController.getCompositionById,
);

module.exports = router;
