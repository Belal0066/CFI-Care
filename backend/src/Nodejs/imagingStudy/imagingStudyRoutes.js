const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const imagingStudyController = require("./imagingStudyController");

// Get imaging studies by patient ID (optional query param: ?modality=...)
router.get(
  "/patient/:patientId",
  requireSession,
  imagingStudyController.getImagingStudiesByPatient,
);

// Create imaging study with specific ID
router.put(
  "/",
  requireSession,
  imagingStudyController.createImagingStudyWithSpecificId,
);

// Create imaging study (auto-generated ID)
router.post("/", requireSession, imagingStudyController.createImagingStudy);

// Get imaging study by ID
router.get("/:id", requireSession, imagingStudyController.getImagingStudyById);

// Update imaging study
router.post("/:id", requireSession, imagingStudyController.updateImagingStudy);

// Delete imaging study
router.delete(
  "/:id",
  requireSession,
  imagingStudyController.deleteImagingStudy,
);

module.exports = router;
