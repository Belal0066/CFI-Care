const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");
const { requireApiAuth } = require('../middleware/requireApiAuth');


router.get("/patient/:patientId", requireApiAuth, EOCController.getEpisodeOfCareByPatient);
router.get("/:id/encounters", requireApiAuth, EOCController.getEncountersByEpisodeOfCareId);
router.put("/", requireApiAuth, EOCController.createEpisodeOfCareWithSpecificId);
router.get("/:id", requireApiAuth, EOCController.getEpisodeOfCareById);
router.post("/:id", EOCController.updateEpisodeOfCare);
router.delete("/:id", EOCController.deleteEpisodeOfCare);
module.exports = router;
