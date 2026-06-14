const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const allergyController = require("./allergyIntoleranceController");

// Get allergies by patient ID
router.get(
  "/patient/:patientId",
  requireApiAuth,
  requirePatientContext({ paramName: "patientId" }),
  allergyController.getAllergiesByPatient,
);

// Create allergy with specific ID
router.put("/", requireApiAuth, requirePatientContext({ paramName: "patientId" }), allergyController.createAllergyWithSpecificId);

// Create allergy (auto-generated ID)
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), allergyController.createAllergy);

// Get allergy by ID
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), allergyController.getAllergyById);

// Update allergy
router.post("/:id", requireApiAuth, requirePatientContext({ paramName: "patientId" }), allergyController.updateAllergy);

// Delete allergy
router.delete("/:id", requireApiAuth, requirePatientContext({ paramName: "patientId" }),allergyController.deleteAllergy);

module.exports = router;
