const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");
const { requireSession } = require('../middleware/requireSession');

router.put("/", practitonerController.createPractitionerWithSpecificId);
router.get("/:id", practitonerController.getPractitionerById);
router.post("/:id", practitonerController.updatePractitioner);
router.delete("/:id", practitonerController.deletePractitioner);

module.exports = router;
