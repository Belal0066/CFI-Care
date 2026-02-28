const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");
// const { requireSession } = require("../middleware/requireSession");
const { requireApiAuth } = require("../middleware/requireApiAuth");


router.put(
  "/",
  requireApiAuth,
  practitonerController.createPractitionerWithSpecificId,
);
router.get("/:id", requireApiAuth, practitonerController.getPractitionerById);
router.post("/:id", practitonerController.updatePractitioner);
router.delete("/:id", practitonerController.deletePractitioner);
router.get("/", practitonerController.getAllPractitioners);

module.exports = router;
