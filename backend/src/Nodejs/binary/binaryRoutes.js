const express = require("express");
const router = express.Router();

const binaryController = require("./binaryController");

router.put("/", binaryController.createPDFBinaryResource);
router.get("/:id", binaryController.getPDFBinaryResource);
module.exports = router;
