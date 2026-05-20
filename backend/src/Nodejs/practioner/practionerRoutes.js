const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const {
  requireResourceOwnership,
} = require("../middleware/requireResourceOwnership");

// Read-only — any authenticated user can list or view practitioners (required for booking flow)
router.get("/", requireApiAuth, practitonerController.getAllPractitioners);
router.get("/:id", requireApiAuth, practitonerController.getPractitionerById);

// Write — only the practitioner themselves (or admin) can mutate their own resource
router.put(
  "/",
  requireApiAuth,
  practitonerController.createPractitionerWithSpecificId,
);
router.post(
  "/:id",
  requireApiAuth,
  requireResourceOwnership({ paramName: "id" }),
  practitonerController.updatePractitioner,
);
router.delete(
  "/:id",
  requireApiAuth,
  requireResourceOwnership({ paramName: "id" }),
  practitonerController.deletePractitioner,
);

module.exports = router;
