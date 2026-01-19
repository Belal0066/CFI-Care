const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");
const { requireSession } = require('../middleware/requireSession');

router.get("/patient/:patientId", requireSession, conditionController.getConditionsByPatientId);
router.get("/:id", requireSession, conditionController.getConditionById);
router.put("/", requireSession, conditionController.createConditionWithSpecificId);
module.exports = router;
