const patientService = require("./patientService");
const toon = require("@toon-format/toon");

//Bad Performance version (Buffering entire response before sending)
// const toonPatientEverything = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const relatedData = await patientService.getPatientAllRelatedData(id);

//     const linesIterable = toon.encodeLines(relatedData, {
//       indent: 1,
//       delimiter: ",",
//     });

//     const linesArray = Array.from(linesIterable);
//     const plainTextData = linesArray.join("\n");

//     // console.log(
//     //   "Toon Encoded Data Preview:",
//     //   plainTextData.substring(0, 100) + "..."
//     // );

//     res.setHeader("Content-Type", "text/plain");
//     res.status(200).send(plainTextData);
//   } catch (error) {
//     console.error("Error in toonPatientEverything controller:", error.message);
//     if (error.message.includes("not found")) {
//       res.status(404).json({ error: error.message });
//     } else {
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }
// };

// Streaming version (Sends data as it's encoded)
const toonPatientEverything = async (req, res) => {
  try {
    const { id } = req.params;

    const relatedData = await patientService.getPatientAllRelatedData(id);

    res.setHeader("Content-Type", "text/plain");

    const linesIterable = toon.encodeLines(relatedData, {
      indent: 1,
      delimiter: ",",
    });

    for (const line of linesIterable) {
      res.write(line + "\n");
    }

    res.end();
  } catch (error) {
    console.error("Error in toonPatientEverything controller:", error.message);

    if (!res.headersSent) {
      if (error.message.includes("not found")) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    } else {
      res.end();
    }
  }
};

const createPatientWithSpecificId = async (req, res) => {
  try {
    const patientData = req.body;
    const newPatientResource = await patientService.createPatientWithSpecificId(
      patientData
    );

    console.log("New patient created successfully.");
    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error("Controller Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const createPatient = async (req, res) => {
  try {
    const patientData = req.body;

    const newPatientResource = await patientService.createPatient(patientData);

    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error("Error in createPatient controller:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const patientResource = await patientService.getPatientById(id);

    res.status(200).json(patientResource);
  } catch (error) {
    console.error("Error in getPatientById controller:", error.message);

    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientAllRelatedData = async (req, res) => {
  try {
    const { id } = req.params;
    const relatedData = await patientService.getPatientAllRelatedData(id);
    res.status(200).json(relatedData);
  } catch (error) {
    console.error(
      "Error in getPatientAllRelatedData controller:",
      error.message
    );
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientObservations = async (req, res) => {
  try {
    const { id } = req.params;
    const observations = await patientService.getPatientObservations(id);
    res.status(200).json(observations);
  } catch (error) {
    console.error("Error in getPatientObservations controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

const getPatientEncounters = async (req, res) => {
  try {
    const { id } = req.params;
    const encounters = await patientService.getPatientEncounters(id);
    res.status(200).json(encounters);
  } catch (error) {
    console.error("Error in getPatientEncounters controller:", error.message);
    if (error.message.includes("not found")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// Get all patients list
// Supports optional ?practitionerId= query param to filter by doctor
const getAllPatients = async (req, res) => {
  try {
    const { practitionerId } = req.query;
    const patients = await patientService.getAllPatients(
      practitionerId || null
    );
    res.status(200).json(patients);
  } catch (error) {
    console.error("Error in getAllPatients controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  createPatientWithSpecificId,
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
  toonPatientEverything,
  getAllPatients,
};
