const express = require("express");
const router = express.Router();
const historyGraphController = require("./historyGraphController");

router.put("/initialize", historyGraphController.InitalizeHistoryGraph);

router.put(
  "/head-node/:patientId/:eocId",
  historyGraphController.createheadNodeEncounter
);

router.get("/:patientId", historyGraphController.getGraphData);

router.post("/seed/:patientId", historyGraphController.createSampleData);

router.post("/addNode", historyGraphController.addNode);

router.put("/addNode", historyGraphController.addNode);

router.put("/updateNode", historyGraphController.updateNode);

router.delete("/:patientId/:nodeId", historyGraphController.deleteNode);

module.exports = router;
