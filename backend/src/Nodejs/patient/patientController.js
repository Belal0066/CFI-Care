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
const jwt = require('jsonwebtoken');
// const keycloakService = require("../services/keycloakService");


function getAccessTokenFromRequest(req) {
  // priority: oauth2-proxy forwarded header
  const forwarded = req.headers['x-access-token'] || null;
  if (forwarded) return forwarded;
}


const createPatient = async (req, res) => {
  try {
    const patientData = req.body;
    const accessToken = await getAccessTokenFromRequest(req, res);
    const newPatientResource = await patientService.createPatient(patientData, accessToken);


    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error("Error in createPatient controller:", error.message);
    res.status(500).json({ error: error.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = await getAccessTokenFromRequest(req, res);

    const patientResource = await patientService.getPatientById(id, accessToken);

    // console.log(`fetched resource for id=${id}:`, JSON.stringify(patientResource, null, 2));

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

const getCurrentPatient = async (req, res) => {
  try {
    let sub = null;
    if (req.kauth && req.kauth.token && req.kauth.token.grant && req.kauth.token.grant.sub) {
      sub = req.kauth.token.grant.sub;
    }

    //fallback , probs not needed :/

    // if (!sub) {
    //   const forwarded = req.headers['x-auth-request-access-token'] || req.headers['x-access-token'] ||
    //     (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    //   if (!forwarded) return res.status(401).json({ error: 'Access token is missing' });
    //   try {
    //     const decoded = jwt.decode(forwarded);
    //     sub = decoded ? decoded.sub : null;
    //   } catch (err) {
    //     return res.status(401).json({ error: 'Invalid access token' });
    //   }
    // }

    if (!sub) return res.status(401).json({ error: 'no subject in token' });

    const patientResource = await patientService.getPatientById(sub);
    res.status(200).json(patientResource);
  } catch (error) {
    console.error('error in getCurrentPatient controller:', error.message);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal srvr error' });
    }
  }
};

const getPatientAllRelatedData = async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = await getAccessTokenFromRequest(req, res);

    const relatedData = await patientService.getPatientAllRelatedData(id, accessToken);
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
    const accessToken = await getAccessTokenFromRequest(req, res);
    const observations = await patientService.getPatientObservations(id, accessToken);
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
    const accessToken = await getAccessTokenFromRequest(req, res);
    const encounters = await patientService.getPatientEncounters(id, accessToken);
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

module.exports = {
  createPatientWithSpecificId,
  createPatient,
  getPatientById,
  getCurrentPatient,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
  toonPatientEverything,
};
