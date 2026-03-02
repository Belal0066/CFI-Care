const observationService = require("./observationService");

const createObservationWithSpecificId = async (req, res) => {
  try {
    const observationData = req.body;
    const newObservation =
      await observationService.createObservationWithSpecificId(observationData);
    console.log("New observation created successfully.");
    res.status(201).json(newObservation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createObservation = async (req, res) => {
  try {
    const observationData = req.body;
    const newObservation =
      await observationService.createObservation(observationData);
    console.log("New observation created successfully.");
    res.status(201).json(newObservation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getObservationById = async (req, res) => {
  try {
    const { id } = req.params;
    const observation = await observationService.getObservationById(id);
    res.status(200).json(observation);
  } catch (error) {
    console.error("Error in getObservationById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getObservationsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const observations =
      await observationService.getObservationsByPatient(patientId);
    res.status(200).json(observations);
  } catch (error) {
    console.error(
      "Error in getObservationsByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getObservationsByCategory = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    const observations = await observationService.getObservationsByCategory(
      patientId,
      category,
    );
    res.status(200).json(observations);
  } catch (error) {
    console.error(
      "Error in getObservationsByCategory controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateObservation = async (req, res) => {
  try {
    const { id } = req.params;
    const observationData = req.body;
    const updatedObservation = await observationService.updateObservation(
      id,
      observationData,
    );
    res.status(200).json(updatedObservation);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteObservation = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await observationService.deleteObservation(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getObservationById,
  getObservationsByPatient,
  getObservationsByCategory,
  createObservationWithSpecificId,
  createObservation,
  updateObservation,
  deleteObservation,
};
