const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const observationController = require("./observationController");

// Get observations by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  observationController.getObservationsByPatient,
);

// Get observations by patient ID and category (query param: ?category=vital-signs)
router.get(
  "/patient/:patientId/category",
  requireApiAuth,
  observationController.getObservationsByCategory,
);

// Create observation with specific ID
router.put(
  "/",
  requireApiAuth,
  observationController.createObservationWithSpecificId,
);

// Create observation (auto-generated ID)
router.post("/", requireApiAuth, observationController.createObservation);

// Get observation by ID
router.get("/:id", requireApiAuth, observationController.getObservationById);

// Update observation
router.post("/:id", requireApiAuth, observationController.updateObservation);

// Delete observation
router.delete("/:id", requireApiAuth, observationController.deleteObservation);

module.exports = router;
