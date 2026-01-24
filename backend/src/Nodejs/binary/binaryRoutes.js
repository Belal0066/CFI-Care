const express = require("express");
const router = express.Router();
const { requireSession } = require('../middleware/requireSession');

const binaryController = require("./binaryController");

router.put("/", binaryController.createPDFBinaryResource);
router.get("/:id", binaryController.getPDFBinaryResource);
router.post("/:id", binaryController.updateBinary);
router.delete("/:id", binaryController.deleteBinary);
module.exports = router;
