const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");
const { requireSession } = require('../middleware/requireSession');


router.put("/", requireSession, practitonerController.createPractitionerWithSpecificId);
router.get("/:id", requireSession, practitonerController.getPractitionerById);
router.post("/:id", practitonerController.updatePractitioner);
router.delete("/:id", practitonerController.deletePractitioner);


module.exports = router;
