const express = require("express");
const router = express.Router();
const historyGraphController = require("./historyGraphController");
const { requireSession } = require('../middleware/requireSession');

router.put("/initialize", requireSession, historyGraphController.InitalizeHistoryGraph);

router.put(
  "/head-node/:patientId/:eocId",
  requireSession, 
  historyGraphController.createheadNodeEncounter
);

router.get("/:patientId", requireSession, historyGraphController.getGraphData);

router.post("/seed/:patientId", requireSession, historyGraphController.createSampleData);

router.post("/addNode", requireSession, historyGraphController.addNode);
router.put("/addNode", requireSession, historyGraphController.addNode);

router.put("/updateNode", requireSession, historyGraphController.updateNode);

router.delete("/:patientId/:nodeId", requireSession, historyGraphController.deleteNode);

module.exports = router;
