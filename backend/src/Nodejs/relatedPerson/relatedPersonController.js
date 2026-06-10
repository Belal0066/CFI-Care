const relatedPersonService = require("./relatedPersonService");

const getAllRelatedPersons = async (req, res) => {
  try {
    const relatedPersons = await relatedPersonService.getAllRelatedPersons();
    res.status(200).json(relatedPersons);
  } catch (error) {
    console.error("Error in getAllRelatedPersons controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getRelatedPersonsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const relatedPersons =
      await relatedPersonService.getRelatedPersonsByPatient(patientId);
    res.status(200).json(relatedPersons);
  } catch (error) {
    console.error(
      "Error in getRelatedPersonsByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createRelatedPersonWithSpecificId = async (req, res) => {
  try {
    const relatedPersonData = req.body;
    const newRelatedPerson =
      await relatedPersonService.createRelatedPersonWithSpecificId(
        relatedPersonData,
      );
    console.log("New related person created successfully.");
    res.status(201).json(newRelatedPerson);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createRelatedPerson = async (req, res) => {
  try {
    const relatedPersonData = req.body;
    const newRelatedPerson =
      await relatedPersonService.createRelatedPerson(relatedPersonData);
    console.log("New related person created successfully.");
    res.status(201).json(newRelatedPerson);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getRelatedPersonById = async (req, res) => {
  try {
    const { id } = req.params;
    const relatedPerson = await relatedPersonService.getRelatedPersonById(id);
    res.status(200).json(relatedPerson);
  } catch (error) {
    console.error("Error in getRelatedPersonById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateRelatedPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const relatedPersonData = req.body;
    const updatedRelatedPerson = await relatedPersonService.updateRelatedPerson(
      id,
      relatedPersonData,
    );
    res.status(200).json(updatedRelatedPerson);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteRelatedPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await relatedPersonService.deleteRelatedPerson(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllRelatedPersons,
  getRelatedPersonsByPatient,
  getRelatedPersonById,
  createRelatedPersonWithSpecificId,
  createRelatedPerson,
  updateRelatedPerson,
  deleteRelatedPerson,
};
