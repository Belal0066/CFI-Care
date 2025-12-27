const practitonerService = require("./practionerService");

const getPractitionerById = async (req, res) => {
  try {
    const { id } = req.params;
    const practitionerResource = await practitonerService.getPractitionerById(
      id
    );
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
        practitionerData
      );
    res.status(201).json(createdPractitioner);
  } catch (error) {
    console.error(
      "Error in createPractitionerWithSpecificId controller:",
      error.message
    );
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getPractitionerById, createPractitionerWithSpecificId };
