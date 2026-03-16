const express = require("express");
const router = express.Router();

const EncounterController = require("./encounterController");
const { requireApiAuth } = require('../middleware/requireApiAuth');

router.get("/:id/related-data", requireApiAuth, EncounterController.getEncounterEverything);
router.put("/", requireApiAuth, EncounterController.createEncounterWithSpecificId);
router.get("/:id", requireApiAuth, EncounterController.getEncounterById);
module.exports = router;
