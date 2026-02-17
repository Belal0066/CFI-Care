const scheduleService = require("./scheduleService");

const createScheduleWithSpecificId = async (req, res) => {
  try {
    const scheduleData = req.body;
    const newSchedule =
      await scheduleService.createScheduleWithSpecificId(scheduleData);
    console.log("New schedule created successfully.");
    res.status(201).json(newSchedule);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createSchedule = async (req, res) => {
  try {
    const scheduleData = req.body;
    const newSchedule = await scheduleService.createSchedule(scheduleData);
    console.log("New schedule created successfully.");
    res.status(201).json(newSchedule);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await scheduleService.getScheduleById(id);
    res.status(200).json(schedule);
  } catch (error) {
    console.error("Error in getScheduleById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getSchedulesByActor = async (req, res) => {
  try {
    const { actorReference } = req.params;
    const schedules = await scheduleService.getSchedulesByActor(actorReference);
    res.status(200).json(schedules);
  } catch (error) {
    console.error("Error in getSchedulesByActor controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getSchedulesByPractitioner = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    // Convert practitioner ID to FHIR reference format
    const actorReference = `Practitioner/${practitionerId}`;
    const schedules = await scheduleService.getSchedulesByActor(actorReference);
    res.status(200).json(schedules);
  } catch (error) {
    console.error(
      "Error in getSchedulesByPractitioner controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const scheduleData = req.body;
    const updatedSchedule = await scheduleService.updateSchedule(
      id,
      scheduleData,
    );
    res.status(200).json(updatedSchedule);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await scheduleService.deleteSchedule(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getScheduleById,
  getSchedulesByActor,
  getSchedulesByPractitioner,
  createScheduleWithSpecificId,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};
