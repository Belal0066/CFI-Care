const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");

router.get("/patient/:patientId", conditionController.getConditionsByPatientId);
router.get("/:id", conditionController.getConditionById);
router.put("/", conditionController.createConditionWithSpecificId);

module.exports = router;
