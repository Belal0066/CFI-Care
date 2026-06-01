const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

async function getCompositionsByPatient(patientId) {
  const cacheKey = `compositions:patient:${patientId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const response = await fhirApi.get(
      `/Composition?subject=Patient/${patientId}`,
    );
    const bundle = response.data;

    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);
    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient compositions.");
  }
}

async function getCompositionById(compositionId) {
  const cacheKey = `composition:${compositionId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const response = await fhirApi.get(`/Composition/${compositionId}`);
    const data = response.data;

    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);
    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Composition not found");
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

module.exports = { getCompositionsByPatient, getCompositionById };
