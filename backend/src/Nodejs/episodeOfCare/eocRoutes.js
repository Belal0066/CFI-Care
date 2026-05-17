const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");
const { requireApiAuth } = require("../middleware/requireApiAuth");
const {
  requirePatientContext,
} = require("../middleware/requirePatientContext");

router.get(
  "/patient/:patientId",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.getEpisodeOfCareByPatient,
);

router.get(
  "/:id/encounters",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.getEncountersByEpisodeOfCareId,
);
router.put(
  "/",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.createEpisodeOfCareWithSpecificId,
);
router.get(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.getEpisodeOfCareById,
);
router.post(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.updateEpisodeOfCare,
);
router.delete(
  "/:id",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  EOCController.deleteEpisodeOfCare,
);

module.exports = router;
