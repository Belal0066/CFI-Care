const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");
const { requireApiAuth } = require('../middleware/requireApiAuth');


router.get("/patient/:patientId", requireApiAuth, conditionController.getConditionsByPatientId);
router.get("/:id", requireApiAuth, conditionController.getConditionById);
router.put("/", requireApiAuth, conditionController.createConditionWithSpecificId);
router.post("/:id", conditionController.updateCondition);
router.delete("/:id", conditionController.deleteCondition);
module.exports = router;
