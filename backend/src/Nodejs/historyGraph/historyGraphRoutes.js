const express = require("express");
const router = express.Router();

const historyGraphController = require("./historyGraphController");

router.put("/", historyGraphController.createHistoryGraph);
module.exports = router;
