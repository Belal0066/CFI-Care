const express = require("express");
const router = express.Router();

const conditionController = require("./conditionController");

router.get("/:id", conditionController.getConditionById);
router.put("/", conditionController.createConditionWithSpecificId);

module.exports = router;
