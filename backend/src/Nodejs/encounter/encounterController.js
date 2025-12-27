const EncounterService = require("./encounterService");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });


const getEncounterById = async (req, res) => {
  try {
    const { id } = req.params;
    const encounterResource = await EncounterService.getEncounterById(id);
    res.status(200).json(encounterResource);
  } catch (error) {
    console.error("Error in getEncounterById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getEncounterEverything = async (req, res) => {
  try {
    const { id } = req.params;
    const relatedResources = await EncounterService.getEncounterEverything(id);
    res.status(200).json(relatedResources);
  } catch (error) {
    console.error("Error in getEncounterEverything controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createEncounterWithSpecificId = async (req, res) => {
  try {
    const encounterData = req.body;
    const newEncounterResource =
      await EncounterService.createEncounterWithSpecificId(encounterData);
    console.log("New Encounter created successfully.");
    res.status(201).json(newEncounterResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getEncounterById,
  getEncounterEverything,
  createEncounterWithSpecificId,
};
