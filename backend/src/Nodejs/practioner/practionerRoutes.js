const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");

const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requireResourceOwnership } = require("../middleware/requireResourceOwnership");




router.put(
  "/",
  requireApiAuth, requireResourceOwnership({ paramName: "id" }),
  practitonerController.createPractitionerWithSpecificId,
);
router.get("/:id", requireApiAuth, requireResourceOwnership({ paramName: "id" }), practitonerController.getPractitionerById);
router.post("/:id",requireApiAuth, requireResourceOwnership({ paramName: "id" }), practitonerController.updatePractitioner);
router.delete("/:id", requireApiAuth, requireResourceOwnership({ paramName: "id" }), practitonerController.deletePractitioner);
router.get("/", requireApiAuth, requireResourceOwnership({ paramName: "id" }), practitonerController.getAllPractitioners);

module.exports = router;
