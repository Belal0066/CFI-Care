const patientService = require("./patientService");

const createPatientWithSpecificId = async (req, res) => {
  try {
    const patientData = req.body;
    const { id } = req.params;
    const newPatientResource = await patientService.createPatientWithSpecificId(
      patientData,
      id
    );
    console.log("New patient created with ID:", id);
    console.log(JSON.stringify(patientData, null, 2));
    res.status(201).json(newPatientResource);
  } catch (error) {
    console.error(
      "Error in createPatientWithSpecificId controller:",
      error.message
    );
    res.status(500).json({ error: error.message });
  }
};
const jwt = require('jsonwebtoken');
// const keycloakService = require("../services/keycloakService");


const checkToken = async (req, res) => {
  const forwardedToken = req.headers['x-access-token'] || null;
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const expectedAudience = process.env.EXPECTED_AUDIENCE;
  const accessToken = forwardedToken //|| bearer;

  if (!accessToken) 
    return res.status(401).json({ error: "Access token is missing" });

  try {
    let decoded;
    
    decoded = jwt.decode(accessToken);
    const aud = decoded ? decoded.aud : null;
    const typ = decoded ? decoded.typ : null;
    const sub = decoded ? decoded.sub : null;
    const exp = decoded ? decoded.exp : null;
    console.log("checkToken summary:", {
      aud,
      typ,
      sub,
      exp
    });

    // short-circuit: return token to caller (controller) for downstream FHIR calls
    return accessToken;
    // if (Array.isArray(decoded.aud)&& decoded.aud.includes(expectedAudience) ) return accessToken;
  } catch (error) {
    return res.status(401).json({ error: "Invalid access token" });
    // console.error("Error in checkToken:", error.message);
    // return null;
  }

 
  // try {
  //   const exchangeToken = await keycloakService.exchangeToken(accessToken, expectedAudience);
  //   return exchangeToken.access_token;
  // } catch (error) {
  //   console.error("Error exchanging token:", error.message);
  //   if (error.response) {
  //     console.error("Keycloak response data:", error.response.data);
  //   }
  //   throw new Error("Could not exchange token for FHIR access.");
  // }
}


const createPatient = async (req, res) => {
  try {
    const patientData = req.body;
    const accessToken = await checkToken(req, res);
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
    const accessToken = await checkToken(req, res);

    const patientResource = await patientService.getPatientById(id, accessToken);

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
    const accessToken = await checkToken(req, res);

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
    const accessToken = await checkToken(req, res);
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
    const accessToken = await checkToken(req, res);
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
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
};
