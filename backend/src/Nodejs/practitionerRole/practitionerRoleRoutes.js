const express = require("express");
const router = express.Router();
// const { requireSession } = require("../middleware/requireSession");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const practitionerRoleController = require("./practitionerRoleController");

// Get all practitioner roles
router.get(
  "/",
  requireApiAuth,
  practitionerRoleController.getAllPractitionerRoles,
);

// Get practitioner roles by practitioner ID
router.get(
  "/practitioner/:practitionerId",
  requireApiAuth,
  practitionerRoleController.getPractitionerRolesByPractitioner,
);

// Get practitioner roles by organization ID
router.get(
  "/organization/:organizationId",
  requireApiAuth,
  practitionerRoleController.getPractitionerRolesByOrganization,
);

// Create practitioner role with specific ID
router.put(
  "/",
  requireApiAuth,
  practitionerRoleController.createPractitionerRoleWithSpecificId,
);

// Create practitioner role (auto-generated ID)
router.post(
  "/",
  requireApiAuth,
  practitionerRoleController.createPractitionerRole,
);

// Get practitioner role by ID
router.get(
  "/:id",
  requireApiAuth,
  practitionerRoleController.getPractitionerRoleById,
);

// Update practitioner role
router.post(
  "/:id",
  requireApiAuth,
  practitionerRoleController.updatePractitionerRole,
);

// Delete practitioner role
router.delete(
  "/:id",
  requireApiAuth,
  practitionerRoleController.deletePractitionerRole,
);

module.exports = router;
