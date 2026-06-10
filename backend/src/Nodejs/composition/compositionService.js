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

function _stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function _extractSummaryFromComposition(composition) {
  if (!composition) return null;
  const sections = composition.section || [];
  if (sections.length > 0) {
    const div = sections[0]?.text?.div || "";
    const text = _stripHtml(div);
    if (text) return text;
  }
  return composition.title || null;
}

// Fetch the Composition that was created for a specific DocumentReference.
// HAPI FHIR R5 renamed the search parameter from "relates-to" (R4) to "related"
// (valid R5 parameter that indexes Composition.relatesTo.resourceReference).
// HAPI resolves urn:uuid: bundle references to DocumentReference/{id} during
// transaction processing, so this query finds the Composition correctly.
async function getCompositionByDocumentReference(documentReferenceId) {
  const cacheKey = `composition:docref:${documentReferenceId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) return cachedData;

    const response = await fhirApi.get(
      `/Composition?related=DocumentReference/${documentReferenceId}`,
    );
    const bundle = response.data;
    const entries = bundle.entry || [];

    if (entries.length === 0) {
      return null;
    }

    const composition = entries[0].resource;
    const result = {
      compositionId: composition.id,
      title: composition.title || null,
      docType: composition.type?.text || null,
      date: composition.date || null,
      summary: _extractSummaryFromComposition(composition),
    };

    await setInCache(cacheKey, result, CACHE_EXPIRATION.DEFAULT);
    return result;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch composition for document reference.");
  }
}

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

module.exports = { getCompositionsByPatient, getCompositionById, getCompositionByDocumentReference };
