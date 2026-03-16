const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const allergyController = require("./allergyIntoleranceController");

// Get allergies by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  allergyController.getAllergiesByPatient,
);

// Create allergy with specific ID
router.put("/", requireApiAuth, allergyController.createAllergyWithSpecificId);

// Create allergy (auto-generated ID)
router.post("/", requireApiAuth, allergyController.createAllergy);

// Get allergy by ID
router.get("/:id", requireApiAuth, allergyController.getAllergyById);

// Update allergy
router.post("/:id", requireApiAuth, allergyController.updateAllergy);

// Delete allergy
router.delete("/:id", requireApiAuth, allergyController.deleteAllergy);

module.exports = router;
