const historyGraphService = require("./historyGraphService");

const createHistoryGraph = async (req, res) => {
  try {
    // FIX: Assign req.body directly to episodeOfCareData
    // (Do not use: const { episodeOfCareData } = req.body;)
    const episodeOfCareData = req.body;

    const historyGraph = await historyGraphService.createHistoryGraph(
      episodeOfCareData
    );
    res.status(201).json(historyGraph);
  } catch (error) {
    console.error("Error in createHistoryGraph controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  createHistoryGraph,
};
