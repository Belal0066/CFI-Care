const express = require("express");
const router = express.Router();
const { requireApiAuth } = require('../middleware/requireApiAuth');
const multer = require("multer");

const binaryController = require("./binaryController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.PDF_UPLOAD_MAX_BYTES || 25 * 1024 * 1024),
  },
});

router.put("/", requireApiAuth, binaryController.createPDFBinaryResource);
router.get("/:id", requireApiAuth, binaryController.getPDFBinaryResource);
router.post("/:id", binaryController.updateBinary);
router.delete("/:id", binaryController.deleteBinary);

module.exports = router;
