const express = require("express");
const router = express.Router();

const EncounterController = require("./encounterController");

router.get("/:id/related-data", EncounterController.getEncounterEverything);
router.put("/", EncounterController.createEncounterWithSpecificId);
router.get("/:id", EncounterController.getEncounterById);
module.exports = router;
