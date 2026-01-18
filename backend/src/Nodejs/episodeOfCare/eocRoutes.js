const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");

router.get("/:id/encounters", EOCController.getEncountersByEpisodeOfCareId);
router.put("/", EOCController.createEpisodeOfCareWithSpecificId);
router.get("/:id", EOCController.getEpisodeOfCareById);
router.post("/:id", EOCController.updateEpisodeOfCare);
router.delete("/:id", EOCController.deleteEpisodeOfCare);

module.exports = router;
