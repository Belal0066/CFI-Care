const express = require("express");
const router = express.Router();
const historyGraphController = require("./historyGraphController");

const { requireApiAuth } = require('../middleware/requireApiAuth');
const { requirePatientContext } = require("../middleware/requirePatientContext");

router.put("/initialize", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.InitalizeHistoryGraph);

router.put(
  "/head-node/:patientId/:eocId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }), 
  historyGraphController.createheadNodeEncounter
);

router.get("/:patientId", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.getGraphData);

router.post("/seed/:patientId", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.createSampleData);

router.post("/addNode", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.addNode);
router.put("/addNode", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.addNode);

router.put("/updateNode", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.updateNode);

router.delete("/:patientId/:nodeId", requireApiAuth,requirePatientContext({ paramName: "patientId" }), historyGraphController.deleteNode);

module.exports = router;
