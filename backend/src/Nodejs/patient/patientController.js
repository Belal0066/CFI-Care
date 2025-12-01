const patientService = require("./patientService");

const createPatientWithSpecificId = async (req, res) => {
  try {
    const patientData = req.body;
    const { id } = req.params;
    const newPatientResource = await patientService.createPatientWithSpecificId(
      patientData,
      id
    );
    console.log("New patient created with ID:", id);
    console.log(JSON.stringify(patientData, null, 2));
    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error(
      "Error in createPatientWithSpecificId controller:",
      error.message
    );
    res.status(500).json({ error: error.message });
  }
};

const createPatient = async (req, res) => {
  try {
    const patientData = req.body;

    const newPatientResource = await patientService.createPatient(patientData);

    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error("Error in createPatient controller:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const patientResource = await patientService.getPatientById(id);

    res.status(200).json(patientResource);
  } catch (error) {
    console.error("Error in getPatientById controller:", error.message);

    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientAllRelatedData = async (req, res) => {
  try {
    const { id } = req.params;
    const relatedData = await patientService.getPatientAllRelatedData(id);
    res.status(200).json(relatedData);
  } catch (error) {
    console.error(
      "Error in getPatientAllRelatedData controller:",
      error.message
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientObservations = async (req, res) => {
  try {
    const { id } = req.params;
    const observations = await patientService.getPatientObservations(id);
    res.status(200).json(observations);
  } catch (error) {
    console.error("Error in getPatientObservations controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientEncounters = async (req, res) => {
  try {
    const { id } = req.params;
    const encounters = await patientService.getPatientEncounters(id);
    res.status(200).json(encounters);
  } catch (error) {
    console.error("Error in getPatientEncounters controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

module.exports = {
  createPatientWithSpecificId,
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
};
