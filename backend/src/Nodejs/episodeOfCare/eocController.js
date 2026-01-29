const EOCService = require("./eocService");

const getEncountersByEpisodeOfCareId = async (req, res) => {
  try {
    const { id } = req.params;
    const encounters = await EOCService.getEncountersByEpisodeOfCareId(id);
    res.status(200).json(encounters);
  } catch (error) {
    console.error(
      "Error in getEncountersByEpisodeOfCareId controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createEpisodeOfCareWithSpecificId = async (req, res) => {
  try {
    const eocData = req.body;
    const newEOCResource =
      await EOCService.createEpisodeOfCareWithSpecificId(eocData);
    console.log("New EpisodeOfCare created successfully.");
    res.status(201).json(newEOCResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getEpisodeOfCareById = async (req, res) => {
  try {
    const { id } = req.params;
    const eocResource = await EOCService.getEpisodeOfCareById(id);
    res.status(200).json(eocResource);
  } catch (error) {
    console.error("Error in getEpisodeOfCareById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateEpisodeOfCare = async (req, res) => {
  try {
    const { id } = req.params;
    const eocData = req.body;
    const updatedEOC = await EOCService.updateEpisodeOfCare(id, eocData);
    res.status(200).json(updatedEOC);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteEpisodeOfCare = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await EOCService.deleteEpisodeOfCare(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createEpisodeOfCareWithSpecificId,
  getEpisodeOfCareById,
  getEncountersByEpisodeOfCareId,
  updateEpisodeOfCare,
  deleteEpisodeOfCare,
};
