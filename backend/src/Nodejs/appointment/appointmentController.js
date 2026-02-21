const appointmentService = require("./appointmentService");

const createAppointmentWithSpecificId = async (req, res) => {
  try {
    const appointmentData = req.body;
    const newAppointment =
      await appointmentService.createAppointmentWithSpecificId(appointmentData);
    console.log("New appointment created successfully.");
    res.status(201).json(newAppointment);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createAppointment = async (req, res) => {
  try {
    const appointmentData = req.body;
    const newAppointment =
      await appointmentService.createAppointment(appointmentData);
    console.log("New appointment created successfully.");
    res.status(201).json(newAppointment);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await appointmentService.getAppointmentById(id);
    res.status(200).json(appointment);
  } catch (error) {
    console.error("Error in getAppointmentById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getAppointmentsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const appointments =
      await appointmentService.getAppointmentsByPatient(patientId);
    res.status(200).json(appointments);
  } catch (error) {
    console.error(
      "Error in getAppointmentsByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getAppointmentsByPractitioner = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    const appointments =
      await appointmentService.getAppointmentsByPractitioner(practitionerId);
    res.status(200).json(appointments);
  } catch (error) {
    console.error(
      "Error in getAppointmentsByPractitioner controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const appointmentData = req.body;
    const updatedAppointment = await appointmentService.updateAppointment(
      id,
      appointmentData,
    );
    res.status(200).json(updatedAppointment);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await appointmentService.deleteAppointment(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAppointmentById,
  getAppointmentsByPatient,
  getAppointmentsByPractitioner,
  createAppointmentWithSpecificId,
  createAppointment,
  updateAppointment,
  deleteAppointment,
};
