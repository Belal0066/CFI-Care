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
      contentType
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

module.exports = {
  createPDFBinaryResource,
  getPDFBinaryResource,
};
