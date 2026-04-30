const express = require("express");
const router = express.Router();
const historyGraphController = require("./historyGraphController");
const { requireApiAuth } = require('../middleware/requireApiAuth');

router.put("/initialize", requireApiAuth, historyGraphController.InitalizeHistoryGraph);

router.put(
  "/head-node/:patientId/:eocId",
  requireApiAuth, 
  historyGraphController.createheadNodeEncounter
);

router.get("/:patientId", requireApiAuth, historyGraphController.getGraphData);

router.post("/seed/:patientId", requireApiAuth, historyGraphController.createSampleData);

router.post("/addNode", requireApiAuth, historyGraphController.addNode);
router.put("/addNode", requireApiAuth, historyGraphController.addNode);

router.put("/updateNode", requireApiAuth, historyGraphController.updateNode);

router.delete("/:patientId/:nodeId", requireApiAuth, historyGraphController.deleteNode);

module.exports = router;
