const organizationService = require("./organizationService");

const getAllOrganizations = async (req, res) => {
  try {
    const organizations = await organizationService.getAllOrganizations();
    res.status(200).json(organizations);
  } catch (error) {
    console.error("Error in getAllOrganizations controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createOrganizationWithSpecificId = async (req, res) => {
  try {
    const organizationData = req.body;
    const newOrganization =
      await organizationService.createOrganizationWithSpecificId(
        organizationData,
      );
    console.log("New organization created successfully.");
    res.status(201).json(newOrganization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createOrganization = async (req, res) => {
  try {
    const organizationData = req.body;
    const newOrganization =
      await organizationService.createOrganization(organizationData);
    console.log("New organization created successfully.");
    res.status(201).json(newOrganization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;
    const organization = await organizationService.getOrganizationById(id);
    res.status(200).json(organization);
  } catch (error) {
    console.error("Error in getOrganizationById controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const organizationData = req.body;
    const updatedOrganization = await organizationService.updateOrganization(
      id,
      organizationData,
    );
    res.status(200).json(updatedOrganization);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await organizationService.deleteOrganization(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllOrganizations,
  getOrganizationById,
  createOrganizationWithSpecificId,
  createOrganization,
  updateOrganization,
  deleteOrganization,
};
