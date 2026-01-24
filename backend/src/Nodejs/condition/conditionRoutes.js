const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");
const { requireSession } = require('../middleware/requireSession');

router.get("/patient/:patientId", conditionController.getConditionsByPatientId);
router.get("/:id", conditionController.getConditionById);
router.put("/", conditionController.createConditionWithSpecificId);
router.post("/:id", conditionController.updateCondition);
router.delete("/:id", conditionController.deleteCondition);

module.exports = router;
