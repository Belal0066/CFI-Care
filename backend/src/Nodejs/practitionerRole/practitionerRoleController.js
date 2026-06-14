const practitionerRoleService = require("./practitionerRoleService");

const getAllPractitionerRoles = async (req, res) => {
  try {
    const practitionerRoles =
      await practitionerRoleService.getAllPractitionerRoles();
    res.status(200).json(practitionerRoles);
  } catch (error) {
    console.error(
      "Error in getAllPractitionerRoles controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getPractitionerRolesByPractitioner = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    const practitionerRoles =
      await practitionerRoleService.getPractitionerRolesByPractitioner(
        practitionerId,
      );
    res.status(200).json(practitionerRoles);
  } catch (error) {
    console.error(
      "Error in getPractitionerRolesByPractitioner controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getPractitionerRolesByOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const practitionerRoles =
      await practitionerRoleService.getPractitionerRolesByOrganization(
        organizationId,
      );
    res.status(200).json(practitionerRoles);
  } catch (error) {
    console.error(
      "Error in getPractitionerRolesByOrganization controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const createPractitionerRoleWithSpecificId = async (req, res) => {
  try {
    const practitionerRoleData = req.body;
    const newPractitionerRole =
      await practitionerRoleService.createPractitionerRoleWithSpecificId(
        practitionerRoleData,
      );
    console.log("New practitioner role created successfully.");
    res.status(201).json(newPractitionerRole);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createPractitionerRole = async (req, res) => {
  try {
    const practitionerRoleData = req.body;
    const newPractitionerRole =
      await practitionerRoleService.createPractitionerRole(
        practitionerRoleData,
      );
    console.log("New practitioner role created successfully.");
    res.status(201).json(newPractitionerRole);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getPractitionerRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const practitionerRole =
      await practitionerRoleService.getPractitionerRoleById(id);
    res.status(200).json(practitionerRole);
  } catch (error) {
    console.error(
      "Error in getPractitionerRoleById controller:",
      error.message,
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const updatePractitionerRole = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.jwt?.sub;
    const practitionerRoleData = req.body;

    // Verify the role belongs to the requesting practitioner (only when reference is present)
    const existingRole = await practitionerRoleService.getPractitionerRoleById(id);
    const practitionerRef = existingRole.practitioner?.reference || "";
    const roleOwnerId = practitionerRef.split("/").pop();
    if (requesterId && roleOwnerId && roleOwnerId !== requesterId) {
      return res.status(403).json({ error: "Forbidden: resource does not belong to this subject" });
    }

    const updatedPractitionerRole =
      await practitionerRoleService.updatePractitionerRole(
        id,
        practitionerRoleData,
      );
    res.status(200).json(updatedPractitionerRole);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deletePractitionerRole = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await practitionerRoleService.deletePractitionerRole(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllPractitionerRoles,
  getPractitionerRolesByPractitioner,
  getPractitionerRolesByOrganization,
  getPractitionerRoleById,
  createPractitionerRoleWithSpecificId,
  createPractitionerRole,
  updatePractitionerRole,
  deletePractitionerRole,
};
