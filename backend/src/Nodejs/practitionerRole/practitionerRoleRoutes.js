const express = require("express");
const router = express.Router();
const { requireSession } = require("../middleware/requireSession");
const practitionerRoleController = require("./practitionerRoleController");

// Get all practitioner roles
router.get(
  "/",
  requireSession,
  practitionerRoleController.getAllPractitionerRoles,
);

// Get practitioner roles by practitioner ID
router.get(
  "/practitioner/:practitionerId",
  requireSession,
  practitionerRoleController.getPractitionerRolesByPractitioner,
);

// Get practitioner roles by organization ID
router.get(
  "/organization/:organizationId",
  requireSession,
  practitionerRoleController.getPractitionerRolesByOrganization,
);

// Create practitioner role with specific ID
router.put(
  "/",
  requireSession,
  practitionerRoleController.createPractitionerRoleWithSpecificId,
);

// Create practitioner role (auto-generated ID)
router.post(
  "/",
  requireSession,
  practitionerRoleController.createPractitionerRole,
);

// Get practitioner role by ID
router.get(
  "/:id",
  requireSession,
  practitionerRoleController.getPractitionerRoleById,
);

// Update practitioner role
router.post(
  "/:id",
  requireSession,
  practitionerRoleController.updatePractitionerRole,
);

// Delete practitioner role
router.delete(
  "/:id",
  requireSession,
  practitionerRoleController.deletePractitionerRole,
);

module.exports = router;
