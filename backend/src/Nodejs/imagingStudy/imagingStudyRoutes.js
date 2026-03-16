const express = require("express");
const router = express.Router();
const { requireApiAuth } = require("../middleware/requireApiAuth");
const imagingStudyController = require("./imagingStudyController");

// Get imaging studies by patient ID (optional query param: ?modality=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,
  imagingStudyController.getImagingStudiesByPatient,
);

// Create imaging study with specific ID
router.put(
  "/",
  requireApiAuth,
  imagingStudyController.createImagingStudyWithSpecificId,
);

// Create imaging study (auto-generated ID)
router.post("/", requireApiAuth, imagingStudyController.createImagingStudy);

// Get imaging study by ID
router.get("/:id", requireApiAuth, imagingStudyController.getImagingStudyById);

// Update imaging study
router.post("/:id", requireApiAuth, imagingStudyController.updateImagingStudy);

// Delete imaging study
router.delete(
  "/:id",
  requireApiAuth,
  imagingStudyController.deleteImagingStudy,
);

module.exports = router;
