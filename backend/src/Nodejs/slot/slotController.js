const slotService = require("./slotService");

const createSlotWithSpecificId = async (req, res) => {
  try {
    const slotData = req.body;
    const newSlot = await slotService.createSlotWithSpecificId(slotData);
    console.log("New slot created successfully.");
    res.status(201).json(newSlot);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createSlot = async (req, res) => {
  try {
    const slotData = req.body;
    const newSlot = await slotService.createSlot(slotData);
    console.log("New slot created successfully.");
    res.status(201).json(newSlot);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getSlotById = async (req, res) => {
  try {
    const { id } = req.params;
    const slot = await slotService.getSlotById(id);
    res.status(200).json(slot);
  } catch (error) {
    console.error("Error in getSlotById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getSlotsBySchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { status } = req.query;
    const slots = await slotService.getSlotsBySchedule(scheduleId, status);
    res.status(200).json(slots);
  } catch (error) {
    console.error("Error in getSlotsBySchedule controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    const { date, scheduleId } = req.query;
    const slots = await slotService.getAvailableSlots(
      practitionerId,
      date,
      scheduleId,
    );
    res.status(200).json(slots);
  } catch (error) {
    console.error("Error in getAvailableSlots controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getSlotsByPractitioner = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    const slots = await slotService.getSlotsByPractitioner(practitionerId);
    res.status(200).json(slots);
  } catch (error) {
    console.error("Error in getSlotsByPractitioner controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const slotData = req.body;
    const updatedSlot = await slotService.updateSlot(id, slotData);
    res.status(200).json(updatedSlot);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await slotService.deleteSlot(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSlotById,
  getSlotsBySchedule,
  getAvailableSlots,
  getSlotsByPractitioner,
  createSlotWithSpecificId,
  createSlot,
  updateSlot,
  deleteSlot,
};
