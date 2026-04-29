const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");
const { requireApiAuth } = require('../middleware/requireApiAuth');
const { requirePatientContext } = require("../middleware/requirePatientContext");


router.get("/patient/:patientId", requireApiAuth,requirePatientContext({ paramName: "patientId" }),  conditionController.getConditionsByPatientId);
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }),  conditionController.getConditionById);
router.put("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }),  conditionController.createConditionWithSpecificId);
router.post("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), conditionController.updateCondition);
router.delete("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), conditionController.deleteCondition);
module.exports = router;
