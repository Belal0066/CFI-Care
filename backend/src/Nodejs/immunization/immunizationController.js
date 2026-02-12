const immunizationService = require("./immunizationService");

const getAllImmunizations = async (req, res) => {
  try {
    const immunizations = await immunizationService.getAllImmunizations();
    res.status(200).json(immunizations);
  } catch (error) {
    console.error("Error in getAllImmunizations controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getImmunizationsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const immunizations =
      await immunizationService.getImmunizationsByPatient(patientId);
    res.status(200).json(immunizations);
  } catch (error) {
    console.error(
      "Error in getImmunizationsByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createImmunizationWithSpecificId = async (req, res) => {
  try {
    const immunizationData = req.body;
    const newImmunization =
      await immunizationService.createImmunizationWithSpecificId(
        immunizationData,
      );
    console.log("New immunization created successfully.");
    res.status(201).json(newImmunization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createImmunization = async (req, res) => {
  try {
    const immunizationData = req.body;
    const newImmunization =
      await immunizationService.createImmunization(immunizationData);
    console.log("New immunization created successfully.");
    res.status(201).json(newImmunization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getImmunizationById = async (req, res) => {
  try {
    const { id } = req.params;
    const immunization = await immunizationService.getImmunizationById(id);
    res.status(200).json(immunization);
  } catch (error) {
    console.error("Error in getImmunizationById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateImmunization = async (req, res) => {
  try {
    const { id } = req.params;
    const immunizationData = req.body;
    const updatedImmunization = await immunizationService.updateImmunization(
      id,
      immunizationData,
    );
    res.status(200).json(updatedImmunization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteImmunization = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await immunizationService.deleteImmunization(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllImmunizations,
  getImmunizationsByPatient,
  getImmunizationById,
  createImmunizationWithSpecificId,
  createImmunization,
  updateImmunization,
  deleteImmunization,
};
