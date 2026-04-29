const express = require("express");
const router = express.Router();

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requireResourceOwnership } = require("../middleware/requireResourceOwnership");

const practitionerRoleController = require("./practitionerRoleController");

// Get all practitioner roles
router.get(
  "/",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.getAllPractitionerRoles,
);

// Get practitioner roles by practitioner ID
router.get(
  "/practitioner/:practitionerId",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.getPractitionerRolesByPractitioner,
);

// Get practitioner roles by organization ID
router.get(
  "/organization/:organizationId",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.getPractitionerRolesByOrganization,
);

// Create practitioner role with specific ID
router.put(
  "/",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.createPractitionerRoleWithSpecificId,
);

// Create practitioner role (auto-generated ID)
router.post(
  "/",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.createPractitionerRole,
);

// Get practitioner role by ID
router.get(
  "/:id",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.getPractitionerRoleById,
);

// Update practitioner role
router.post(
  "/:id",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.updatePractitionerRole,
);

// Delete practitioner role
router.delete(
  "/:id",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitionerRoleController.deletePractitionerRole,
);

module.exports = router;
