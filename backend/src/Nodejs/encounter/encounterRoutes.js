const express = require("express");
const router = express.Router();

const EncounterController = require("./encounterController");
const { requireSession } = require('../middleware/requireSession');

router.get("/:id/related-data", requireSession, EncounterController.getEncounterEverything);
router.put("/", requireSession, EncounterController.createEncounterWithSpecificId);
router.get("/:id", requireSession, EncounterController.getEncounterById);
module.exports = router;
