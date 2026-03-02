const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");
const { requireSession } = require('../middleware/requireSession');


router.get("/:id/encounters", requireSession, EOCController.getEncountersByEpisodeOfCareId);
router.put("/", requireSession, EOCController.createEpisodeOfCareWithSpecificId);
router.get("/:id", requireSession, EOCController.getEpisodeOfCareById);
router.post("/:id", EOCController.updateEpisodeOfCare);
router.delete("/:id", EOCController.deleteEpisodeOfCare);
module.exports = router;
