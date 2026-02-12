const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const observationController = require("./observationController");

// Get observations by patient ID
router.get(
  "/patient/:patientId",
  requireSession,
  observationController.getObservationsByPatient,
);

// Get observations by patient ID and category (query param: ?category=vital-signs)
router.get(
  "/patient/:patientId/category",
  requireSession,
  observationController.getObservationsByCategory,
);

// Create observation with specific ID
router.put(
  "/",
  requireSession,
  observationController.createObservationWithSpecificId,
);

// Create observation (auto-generated ID)
router.post("/", requireSession, observationController.createObservation);

// Get observation by ID
router.get("/:id", requireSession, observationController.getObservationById);

// Update observation
router.post("/:id", requireSession, observationController.updateObservation);

// Delete observation
router.delete("/:id", requireSession, observationController.deleteObservation);

module.exports = router;
