const express = require("express");
const router = express.Router();

const EOCController = require("./eocController");

router.put("/", EOCController.createEpisodeOfCareWithSpecificId);
router.get("/:id", EOCController.getEpisodeOfCareById);

module.exports = router;
