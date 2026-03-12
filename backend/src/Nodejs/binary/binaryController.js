const binaryService = require("./binaryService");

const createPDFBinaryResource = async (req, res) => {
  try {
    const { file, data, id, contentType, patientId, documentReferenceId } =
      req.body;
    const uploadedPdf = req.file;

    // Validate inputs
    if ((!file && !data && !uploadedPdf) || !id) {
      return res.status(400).json({
        error:
          "ID and one of file path, base64 data, or multipart pdf are required",
      });
    }

    const newBinaryResource = await binaryService.createPDFBinaryResource(
      file,
      id,
      contentType,
      data,
      uploadedPdf,
      patientId,
      documentReferenceId,
    );

    console.log("New Binary resource created successfully.");
    res.status(201).json(newBinaryResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

//Get PDF Binary Resource by ID
const getPDFBinaryResource = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "ID parameter is required" });
    }
    const binaryResource = await binaryService.getPDFBinaryResource(id);
    res.status(200).json(binaryResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const updateBinary = async (req, res) => {
  try {
    const { id } = req.params;
    const { file, data, contentType, patientId, documentReferenceId } =
      req.body;
    const uploadedPdf = req.file;

    if (!id || (!file && !data && !uploadedPdf)) {
      return res.status(400).json({
        error:
          "ID and one of file path, base64 data, or multipart pdf are required",
      });
    }

    const updatedBinary = await binaryService.updateBinary(
      id,
      file,
      contentType,
      data,
      uploadedPdf,
      patientId,
      documentReferenceId,
    );
    res.status(200).json(updatedBinary);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteBinary = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "ID parameter is required" });
    }
    const result = await binaryService.deleteBinary(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createPDFBinaryResource,
  getPDFBinaryResource,
  updateBinary,
  deleteBinary,
};
