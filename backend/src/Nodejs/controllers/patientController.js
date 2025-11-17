const patientService = require("../services/patientService");
const jwt = require('jsonwebtoken');
const keycloakService = require("../services/keycloakService");


const checkToken = async (req, res) => {
  const bearer = req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const sessionToken = req.session && req.session.tokenSet && req.session.tokenSet.access_token;
  const accessToken = bearer || sessionToken;
  const expectedAudience = process.env.EXPECTED_AUDIENCE;

  if (!accessToken) return null;

  try {
    const decoded = jwt.decode(accessToken);
    if (decoded && decoded.aud === expectedAudience) {
      return accessToken;
    }
    // if (Array.isArray(decoded.aud)&& decoded.aud.includes(expectedAudience) ) return accessToken;
  } catch (error) {
    // console.error("Error in checkToken:", error.message);
    // return null;
  }

  if (req.session && req.session.tokenSet && Date.now() < req.session.tokenSet.expires_at) {
    return req.session.tokenSet.access_token;
  }
  try {
    const exchangeToken = await keycloakService.exchangeToken(accessToken, expectedAudience);
    exchangeToken.expires_at = Date.now() + (exchangeToken.expires_in * 1000);
    if (req.session) req.session.tokenSet = exchangeToken;
    return exchangeToken.access_token;
  } catch (error) {
    console.error("Error exchanging token:", error.message);
    if (error.response) {
      console.error("Keycloak response data:", error.response.data);
    }
    throw new Error("Could not exchange token for FHIR access.");
  }
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
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
};
