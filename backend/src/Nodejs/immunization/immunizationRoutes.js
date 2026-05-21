const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const immunizationController = require("./immunizationController");

// Get all immunizations
router.get("/", requireApiAuth, immunizationController.getAllImmunizations);

// Get immunizations by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  immunizationController.getImmunizationsByPatient,
);

// Create immunization with specific ID
router.put(
  "/",
  requireApiAuth,
  immunizationController.createImmunizationWithSpecificId,
);

// Create immunization (auto-generated ID)
router.post("/", requireApiAuth, immunizationController.createImmunization);

// Get immunization by ID
router.get("/:id", requireApiAuth, immunizationController.getImmunizationById);

// Update immunization
router.post("/:id", requireApiAuth, immunizationController.updateImmunization);

// Delete immunization
router.delete(
  "/:id",
  requireApiAuth,
  immunizationController.deleteImmunization,
);

module.exports = router;
