const healthcareServiceService = require("./healthcareServiceService");

const getAllHealthcareServices = async (req, res) => {
  try {
    const healthcareServices =
      await healthcareServiceService.getAllHealthcareServices();
    res.status(200).json(healthcareServices);
  } catch (error) {
    console.error(
      "Error in getAllHealthcareServices controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getHealthcareServicesByOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const healthcareServices =
      await healthcareServiceService.getHealthcareServicesByOrganization(
        organizationId,
      );
    res.status(200).json(healthcareServices);
  } catch (error) {
    console.error(
      "Error in getHealthcareServicesByOrganization controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createHealthcareServiceWithSpecificId = async (req, res) => {
  try {
    const healthcareServiceData = req.body;
    const newHealthcareService =
      await healthcareServiceService.createHealthcareServiceWithSpecificId(
        healthcareServiceData,
      );
    console.log("New healthcare service created successfully.");
    res.status(201).json(newHealthcareService);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createHealthcareService = async (req, res) => {
  try {
    const healthcareServiceData = req.body;
    const newHealthcareService =
      await healthcareServiceService.createHealthcareService(
        healthcareServiceData,
      );
    console.log("New healthcare service created successfully.");
    res.status(201).json(newHealthcareService);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getHealthcareServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const healthcareService =
      await healthcareServiceService.getHealthcareServiceById(id);
    res.status(200).json(healthcareService);
  } catch (error) {
    console.error(
      "Error in getHealthcareServiceById controller:",
      error.message,
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateHealthcareService = async (req, res) => {
  try {
    const { id } = req.params;
    const healthcareServiceData = req.body;
    const updatedHealthcareService =
      await healthcareServiceService.updateHealthcareService(
        id,
        healthcareServiceData,
      );
    res.status(200).json(updatedHealthcareService);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteHealthcareService = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await healthcareServiceService.deleteHealthcareService(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllHealthcareServices,
  getHealthcareServicesByOrganization,
  getHealthcareServiceById,
  createHealthcareServiceWithSpecificId,
  createHealthcareService,
  updateHealthcareService,
  deleteHealthcareService,
};
