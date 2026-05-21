const deviceService = require("./deviceService");

const getAllDevices = async (req, res) => {
  try {
    const devices = await deviceService.getAllDevices();
    res.status(200).json(devices);
  } catch (error) {
    console.error("Error in getAllDevices controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getDevicesByOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const devices =
      await deviceService.getDevicesByOrganization(organizationId);
    res.status(200).json(devices);
  } catch (error) {
    console.error(
      "Error in getDevicesByOrganization controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createDeviceWithSpecificId = async (req, res) => {
  try {
    const deviceData = req.body;
    const newDevice =
      await deviceService.createDeviceWithSpecificId(deviceData);
    console.log("New device created successfully.");
    res.status(201).json(newDevice);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createDevice = async (req, res) => {
  try {
    const deviceData = req.body;
    const newDevice = await deviceService.createDevice(deviceData);
    console.log("New device created successfully.");
    res.status(201).json(newDevice);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getDeviceById = async (req, res) => {
  try {
    const { id } = req.params;
    const device = await deviceService.getDeviceById(id);
    res.status(200).json(device);
  } catch (error) {
    console.error("Error in getDeviceById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const deviceData = req.body;
    const updatedDevice = await deviceService.updateDevice(id, deviceData);
    res.status(200).json(updatedDevice);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deviceService.deleteDevice(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllDevices,
  getDevicesByOrganization,
  getDeviceById,
  createDeviceWithSpecificId,
  createDevice,
  updateDevice,
  deleteDevice,
};
