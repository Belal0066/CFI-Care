const binaryService = require("./binaryService");

const createPDFBinaryResource = async (req, res) => {
  try {
    // CHANGED: Added `id` to destructuring
    const { file, id, contentType } = req.body;

    // Validate inputs
    if (!file || !id) {
      return res.status(400).json({ error: "File path and ID are required" });
    }

    // CHANGED: Passed arguments in the correct order matching the service
    const newBinaryResource = await binaryService.createPDFBinaryResource(
      file,
      id,
      contentType,
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
    const { file, contentType } = req.body;

    if (!id || !file) {
      return res.status(400).json({ error: "ID and file are required" });
    }

    const updatedBinary = await binaryService.updateBinary(
      id,
      file,
      contentType,
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
