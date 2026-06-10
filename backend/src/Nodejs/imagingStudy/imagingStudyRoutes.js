const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requirePatientContext } = require("../middleware/requirePatientContext");

const imagingStudyController = require("./imagingStudyController");

// Get imaging studies by patient ID (optional query param: ?modality=...)
router.get(
  "/patient/:patientId",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  imagingStudyController.getImagingStudiesByPatient,
);

// Create imaging study with specific ID
router.put(
  "/",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  imagingStudyController.createImagingStudyWithSpecificId,
);

// Create imaging study (auto-generated ID)
router.post("/", requireApiAuth,requirePatientContext({ paramName: "patientId" }), imagingStudyController.createImagingStudy);

// Get imaging study by ID
router.get("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), imagingStudyController.getImagingStudyById);

// Update imaging study
router.post("/:id", requireApiAuth,requirePatientContext({ paramName: "patientId" }), imagingStudyController.updateImagingStudy);

// Delete imaging study
router.delete(
  "/:id",
  requireApiAuth,requirePatientContext({ paramName: "patientId" }),
  imagingStudyController.deleteImagingStudy,
);

module.exports = router;
