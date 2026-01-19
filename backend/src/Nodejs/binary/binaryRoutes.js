const express = require("express");
const router = express.Router();
const { requireSession } = require('../middleware/requireSession');

const binaryController = require("./binaryController");

router.put("/", requireSession, binaryController.createPDFBinaryResource);
router.get("/:id", requireSession, binaryController.getPDFBinaryResource);
module.exports = router;
