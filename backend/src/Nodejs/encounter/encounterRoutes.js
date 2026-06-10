const express = require("express");
const router = express.Router();

const EncounterController = require("./encounterController");
const { requireApiAuth } = require('../middleware/requireApiAuth');
const { requirePatientContext } = require("../middleware/requirePatientContext");

router.get("/:id/related-data", requireApiAuth,requirePatientContext({ paramName: "patientId" }), EncounterController.getEncounterEverything);
router.put("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), EncounterController.createEncounterWithSpecificId);
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), EncounterController.getEncounterById);
module.exports = router;
