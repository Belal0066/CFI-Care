const compositionService = require("./compositionService");

const getCompositionByDocumentReference = async (req, res) => {
  try {
    const { documentReferenceId } = req.params;
    const result = await compositionService.getCompositionByDocumentReference(documentReferenceId);
    if (!result) {
      return res.status(404).json({ error: "No composition found for this document" });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCompositionByDocumentReference controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getCompositionsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const bundle = await compositionService.getCompositionsByPatient(patientId);
    res.status(200).json(bundle);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getCompositionById = async (req, res) => {
  try {
    const { id } = req.params;
    const composition = await compositionService.getCompositionById(id);
    res.status(200).json(composition);
  } catch (error) {
    console.error("Error in getCompositionById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

module.exports = { getCompositionsByPatient, getCompositionById, getCompositionByDocumentReference };
