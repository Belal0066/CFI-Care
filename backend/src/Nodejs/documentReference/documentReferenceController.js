const documentReferenceService = require("./documentReferenceService");

const createDocumentReferenceWithSpecificId = async (req, res) => {
  try {
    const documentReferenceData = req.body;
    const newDocumentReference =
      await documentReferenceService.createDocumentReferenceWithSpecificId(
        documentReferenceData,
      );
    console.log("New document reference created successfully.");
    res.status(201).json(newDocumentReference);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createDocumentReference = async (req, res) => {
  try {
    const documentReferenceData = req.body;
    const newDocumentReference =
      await documentReferenceService.createDocumentReference(
        documentReferenceData,
      );
    console.log("New document reference created successfully.");
    res.status(201).json(newDocumentReference);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getDocumentReferenceById = async (req, res) => {
  try {
    const { id } = req.params;
    const documentReference =
      await documentReferenceService.getDocumentReferenceById(id);
    res.status(200).json(documentReference);
  } catch (error) {
    console.error(
      "Error in getDocumentReferenceById controller:",
      error.message,
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getDocumentReferencesByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, category } = req.query;
    const documentReferences =
      await documentReferenceService.getDocumentReferencesByPatient(
        patientId,
        type,
        category,
      );
    res.status(200).json(documentReferences);
  } catch (error) {
    console.error(
      "Error in getDocumentReferencesByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateDocumentReference = async (req, res) => {
  try {
    const { id } = req.params;
    const documentReferenceData = req.body;
    const updatedDocumentReference =
      await documentReferenceService.updateDocumentReference(
        id,
        documentReferenceData,
      );
    res.status(200).json(updatedDocumentReference);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteDocumentReference = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await documentReferenceService.deleteDocumentReference(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getDocumentReferenceById,
  getDocumentReferencesByPatient,
  createDocumentReferenceWithSpecificId,
  createDocumentReference,
  updateDocumentReference,
  deleteDocumentReference,
};
