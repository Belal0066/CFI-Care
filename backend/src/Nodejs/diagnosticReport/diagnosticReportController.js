const diagnosticReportService = require("./diagnosticReportService");

const createDiagnosticReportWithSpecificId = async (req, res) => {
  try {
    const diagnosticReportData = req.body;
    const newDiagnosticReport =
      await diagnosticReportService.createDiagnosticReportWithSpecificId(
        diagnosticReportData,
      );
    console.log("New diagnostic report created successfully.");
    res.status(201).json(newDiagnosticReport);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createDiagnosticReport = async (req, res) => {
  try {
    const diagnosticReportData = req.body;
    const newDiagnosticReport =
      await diagnosticReportService.createDiagnosticReport(
        diagnosticReportData,
      );
    console.log("New diagnostic report created successfully.");
    res.status(201).json(newDiagnosticReport);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getDiagnosticReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const diagnosticReport =
      await diagnosticReportService.getDiagnosticReportById(id);
    res.status(200).json(diagnosticReport);
  } catch (error) {
    console.error(
      "Error in getDiagnosticReportById controller:",
      error.message,
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getDiagnosticReportsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { category } = req.query;
    const diagnosticReports =
      await diagnosticReportService.getDiagnosticReportsByPatient(
        patientId,
        category,
      );
    res.status(200).json(diagnosticReports);
  } catch (error) {
    console.error(
      "Error in getDiagnosticReportsByPatient controller:",
      error.message,
    );
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateDiagnosticReport = async (req, res) => {
  try {
    const { id } = req.params;
    const diagnosticReportData = req.body;
    const updatedDiagnosticReport =
      await diagnosticReportService.updateDiagnosticReport(
        id,
        diagnosticReportData,
      );
    res.status(200).json(updatedDiagnosticReport);
  } catch (error) {
    console.error("Controller Error:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

const deleteDiagnosticReport = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await diagnosticReportService.deleteDiagnosticReport(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getDiagnosticReportById,
  getDiagnosticReportsByPatient,
  createDiagnosticReportWithSpecificId,
  createDiagnosticReport,
  updateDiagnosticReport,
  deleteDiagnosticReport,
};
