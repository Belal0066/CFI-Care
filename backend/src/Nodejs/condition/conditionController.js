const conditionService = require("./conditionService");

const createConditionWithSpecificId = async (req, res) => {
  try {
    const conditionData = req.body;
    const newConditionResource =
      await conditionService.createConditionWithSpecificId(conditionData);
    console.log("New condition created successfully.");
    res.status(201).json(newConditionResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getConditionById = async (req, res) => {
  try {
    const { id } = req.params;
    const conditionResource = await conditionService.getConditionById(id);
    res.status(200).json(conditionResource);
  } catch (error) {
    console.error("Error in getConditionById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getConditionsByPatientId = async (req, res) => {
  try {
    const { patientId } = req.params;
    const conditions =
      await conditionService.getConditionsByPatientId(patientId);
    res.status(200).json(conditions);
  } catch (error) {
    console.error(
      "Error in getConditionsByPatientId controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateCondition = async (req, res) => {
  try {
    const { id } = req.params;
    const conditionData = req.body;
    const updatedCondition = await conditionService.updateCondition(
      id,
      conditionData,
    );
    res.status(200).json(updatedCondition);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteCondition = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await conditionService.deleteCondition(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getConditionById,
  getConditionsByPatientId,
  createConditionWithSpecificId,
  updateCondition,
  deleteCondition,
};
