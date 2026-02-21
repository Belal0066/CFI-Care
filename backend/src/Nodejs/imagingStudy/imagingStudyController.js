const imagingStudyService = require("./imagingStudyService");

const createImagingStudyWithSpecificId = async (req, res) => {
  try {
    const imagingStudyData = req.body;
    const newImagingStudy =
      await imagingStudyService.createImagingStudyWithSpecificId(
        imagingStudyData,
      );
    console.log("New imaging study created successfully.");
    res.status(201).json(newImagingStudy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createImagingStudy = async (req, res) => {
  try {
    const imagingStudyData = req.body;
    const newImagingStudy =
      await imagingStudyService.createImagingStudy(imagingStudyData);
    console.log("New imaging study created successfully.");
    res.status(201).json(newImagingStudy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getImagingStudyById = async (req, res) => {
  try {
    const { id } = req.params;
    const imagingStudy = await imagingStudyService.getImagingStudyById(id);
    res.status(200).json(imagingStudy);
  } catch (error) {
    console.error("Error in getImagingStudyById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getImagingStudiesByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { modality } = req.query;
    const imagingStudies = await imagingStudyService.getImagingStudiesByPatient(
      patientId,
      modality,
    );
    res.status(200).json(imagingStudies);
  } catch (error) {
    console.error(
      "Error in getImagingStudiesByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateImagingStudy = async (req, res) => {
  try {
    const { id } = req.params;
    const imagingStudyData = req.body;
    const updatedImagingStudy = await imagingStudyService.updateImagingStudy(
      id,
      imagingStudyData,
    );
    res.status(200).json(updatedImagingStudy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteImagingStudy = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await imagingStudyService.deleteImagingStudy(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getImagingStudyById,
  getImagingStudiesByPatient,
  createImagingStudyWithSpecificId,
  createImagingStudy,
  updateImagingStudy,
  deleteImagingStudy,
};
