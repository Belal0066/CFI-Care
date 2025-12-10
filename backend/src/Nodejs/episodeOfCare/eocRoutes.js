const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");

router.get("/:id/encounters", EOCController.getEncountersByEpisodeOfCareId);
router.put("/", EOCController.createEpisodeOfCareWithSpecificId);
router.get("/:id", EOCController.getEpisodeOfCareById);

module.exports = router;
