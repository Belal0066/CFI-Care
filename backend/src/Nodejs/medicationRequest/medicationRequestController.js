const medicationRequestService = require("./medicationRequestService");

const createMedicationRequestWithSpecificId = async (req, res) => {
  try {
    const medicationRequestData = req.body;
    const newMedicationRequestResource =
      await medicationRequestService.createMedicationRequestWithSpecificId(
        medicationRequestData,
      );
    console.log("New medication request created successfully.");
    res.status(201).json(newMedicationRequestResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getMedicationRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const medicationRequestResource =
      await medicationRequestService.getMedicationRequestById(id);
    res.status(200).json(medicationRequestResource);
  } catch (error) {
    console.error(
      "Error in getMedicationRequestById controller:",
      error.message,
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getMedicationRequestsByPatientId = async (req, res) => {
  try {
    const { patientId } = req.params;
    const medicationRequests =
      await medicationRequestService.getMedicationRequestsByPatientId(
        patientId,
      );
    res.status(200).json(medicationRequests);
  } catch (error) {
    console.error(
      "Error in getMedicationRequestsByPatientId controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMedicationRequestsByEncounterId = async (req, res) => {
  try {
    const { encounterId } = req.params;
    const medicationRequests =
      await medicationRequestService.getMedicationRequestsByEncounterId(
        encounterId,
      );
    res.status(200).json(medicationRequests);
  } catch (error) {
    console.error(
      "Error in getMedicationRequestsByEncounterId controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMedicationRequestsByPractitionerId = async (req, res) => {
  try {
    const { practitionerId } = req.params;
    const medicationRequests =
      await medicationRequestService.getMedicationRequestsByPractitionerId(
        practitionerId,
      );
    res.status(200).json(medicationRequests);
  } catch (error) {
    console.error(
      "Error in getMedicationRequestsByPractitionerId controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const getMedicationRequestsByStatus = async (req, res) => {
  try {
    const { patientId, status } = req.params;
    const medicationRequests =
      await medicationRequestService.getMedicationRequestsByStatus(
        patientId,
        status,
      );
    res.status(200).json(medicationRequests);
  } catch (error) {
    console.error(
      "Error in getMedicationRequestsByStatus controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateMedicationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const medicationRequestData = req.body;
    const updatedMedicationRequest =
      await medicationRequestService.updateMedicationRequest(
        id,
        medicationRequestData,
      );
    console.log("Medication request updated successfully.");
    res.status(200).json(updatedMedicationRequest);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteMedicationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await medicationRequestService.deleteMedicationRequest(id);
    console.log("Medication request deleted successfully.");
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMedicationRequestById,
  getMedicationRequestsByPatientId,
  getMedicationRequestsByEncounterId,
  getMedicationRequestsByPractitionerId,
  getMedicationRequestsByStatus,
  createMedicationRequestWithSpecificId,
  updateMedicationRequest,
  deleteMedicationRequest,
};
