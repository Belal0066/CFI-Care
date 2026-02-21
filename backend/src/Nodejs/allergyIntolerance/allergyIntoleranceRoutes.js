const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const allergyController = require("./allergyIntoleranceController");

// Get allergies by patient ID
router.get(
  "/patient/:patientId",
  requireSession,
  allergyController.getAllergiesByPatient,
);

// Create allergy with specific ID
router.put("/", requireSession, allergyController.createAllergyWithSpecificId);

// Create allergy (auto-generated ID)
router.post("/", requireSession, allergyController.createAllergy);

// Get allergy by ID
router.get("/:id", requireSession, allergyController.getAllergyById);

// Update allergy
router.post("/:id", requireSession, allergyController.updateAllergy);

// Delete allergy
router.delete("/:id", requireSession, allergyController.deleteAllergy);

module.exports = router;
