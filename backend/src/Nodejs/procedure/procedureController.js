const procedureService = require("./procedureService");

// Get all procedures for a patient
async function getProceduresByPatientId(req, res) {
  const { patientId } = req.params;

  try {
    const bundle = await procedureService.getProceduresByPatientId(patientId);
    res.json(bundle);
  } catch (error) {
    console.error("Error fetching procedures for patient:", error.message);
    res.status(500).json({ error: "Failed to fetch procedures for patient." });
  }
}

// Get procedure by ID
async function getProcedureById(req, res) {
  const { procedureId } = req.params;

  try {
    const procedure = await procedureService.getProcedureById(procedureId);
    res.json(procedure);
  } catch (error) {
    console.error("Error fetching procedure:", error.message);
    res.status(500).json({ error: "Failed to fetch procedure." });
  }
}

// Create a new procedure
async function createProcedure(req, res) {
  const procedureData = req.body;

  try {
    const procedure = await procedureService.createProcedure(procedureData);
    res.status(201).json(procedure);
  } catch (error) {
    console.error("Error creating procedure:", error.message);
    res.status(500).json({ error: "Failed to create procedure." });
  }
}

// Update procedure
async function updateProcedure(req, res) {
  const { procedureId } = req.params;
  const procedureData = req.body;

  try {
    const procedure = await procedureService.updateProcedure(
      procedureId,
      procedureData,
    );
    res.json(procedure);
  } catch (error) {
    console.error("Error updating procedure:", error.message);
    res.status(500).json({ error: "Failed to update procedure." });
  }
}

// Delete procedure
async function deleteProcedure(req, res) {
  const { procedureId } = req.params;

  try {
    const result = await procedureService.deleteProcedure(procedureId);
    res.json(result);
  } catch (error) {
    console.error("Error deleting procedure:", error.message);
    res.status(500).json({ error: "Failed to delete procedure." });
  }
}

module.exports = {
  getProceduresByPatientId,
  getProcedureById,
  createProcedure,
  updateProcedure,
  deleteProcedure,
};
