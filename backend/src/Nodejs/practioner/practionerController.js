const practitonerService = require("./practionerService");

const getPractitionerById = async (req, res) => {
  try {
    const { id } = req.params;
    const practitionerResource =
      await practitonerService.getPractitionerById(id);
    res.status(200).json(practitionerResource);
  } catch (error) {
    console.error("Error in getPractitionerById controller:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createPractitionerWithSpecificId = async (req, res) => {
  try {
    const practitionerData = req.body;
    const createdPractitioner =
      await practitonerService.createPractitionerWithSpecificId(
        practitionerData,
      );
    res.status(201).json(createdPractitioner);
  } catch (error) {
    console.error(
      "Error in createPractitionerWithSpecificId controller:",
      error.message,
    );
    res.status(500).json({ error: error.message });
  }
};

const updatePractitioner = async (req, res) => {
  try {
    const { id } = req.params;
    const practitionerData = req.body;
    const updatedPractitioner = await practitonerService.updatePractitioner(
      id,
      practitionerData,
    );
    res.status(200).json(updatedPractitioner);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deletePractitioner = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await practitonerService.deletePractitioner(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPractitionerById,
  createPractitionerWithSpecificId,
  updatePractitioner,
  deletePractitioner,
};
