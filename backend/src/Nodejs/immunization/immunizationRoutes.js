const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const immunizationController = require("./immunizationController");

// Get all immunizations
router.get("/", requireSession, immunizationController.getAllImmunizations);

// Get immunizations by patient ID
router.get(
  "/patient/:patientId",
  requireSession,
  immunizationController.getImmunizationsByPatient,
);

// Create immunization with specific ID
router.put(
  "/",
  requireSession,
  immunizationController.createImmunizationWithSpecificId,
);

// Create immunization (auto-generated ID)
router.post("/", requireSession, immunizationController.createImmunization);

// Get immunization by ID
router.get("/:id", requireSession, immunizationController.getImmunizationById);

// Update immunization
router.post("/:id", requireSession, immunizationController.updateImmunization);

// Delete immunization
router.delete(
  "/:id",
  requireSession,
  immunizationController.deleteImmunization,
);

module.exports = router;
