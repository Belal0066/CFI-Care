const express = require("express");
const router = express.Router();
const practitonerController = require("./practionerController");
router.get("/:id", practitonerController.getPractitionerById);
module.exports = router;
