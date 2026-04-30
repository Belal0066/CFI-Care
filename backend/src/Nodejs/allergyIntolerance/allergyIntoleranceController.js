const allergyService = require("./allergyIntoleranceService");

const createAllergyWithSpecificId = async (req, res) => {
  try {
    const allergyData = req.body;
    const newAllergy =
      await allergyService.createAllergyWithSpecificId(allergyData);
    console.log("New allergy created successfully.");
    res.status(201).json(newAllergy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createAllergy = async (req, res) => {
  try {
    const allergyData = req.body;
    const newAllergy = await allergyService.createAllergy(allergyData);
    console.log("New allergy created successfully.");
    res.status(201).json(newAllergy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getAllergyById = async (req, res) => {
  try {
    const { id } = req.params;
    const allergy = await allergyService.getAllergyById(id);
    res.status(200).json(allergy);
  } catch (error) {
    console.error("Error in getAllergyById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getAllergiesByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const allergies = await allergyService.getAllergiesByPatient(patientId);
    res.status(200).json(allergies);
  } catch (error) {
    console.error("Error in getAllergiesByPatient controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateAllergy = async (req, res) => {
  try {
    const { id } = req.params;
    const allergyData = req.body;
    const updatedAllergy = await allergyService.updateAllergy(id, allergyData);
    res.status(200).json(updatedAllergy);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteAllergy = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await allergyService.deleteAllergy(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllergyById,
  getAllergiesByPatient,
  createAllergyWithSpecificId,
  createAllergy,
  updateAllergy,
  deleteAllergy,
};
