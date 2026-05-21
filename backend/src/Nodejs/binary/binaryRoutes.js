const express = require("express");
const router = express.Router();
const { requireApiAuth } = require('../middleware/requireApiAuth');

const binaryController = require("./binaryController");


router.put("/", requireApiAuth, binaryController.createPDFBinaryResource);
router.get("/:id", requireApiAuth, binaryController.getPDFBinaryResource);
router.post("/:id", binaryController.updateBinary);
router.delete("/:id", binaryController.deleteBinary);

module.exports = router;
