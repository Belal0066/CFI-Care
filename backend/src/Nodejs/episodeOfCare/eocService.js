const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Get Encounters related to an EpisodeOfCare
async function getEncountersByEpisodeOfCareId(eocId) {
  try {
    const response = await fhirApi.get(`/Encounter`, {
      params: {
        // CORRECTION: Use 'episode-of-care' instead of 'episodeofcare'
        "episode-of-care": eocId,
      },
    });
    return response.data.entry
      ? response.data.entry.map((e) => e.resource)
      : [];
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

// Fetch EpisodeOfCare by ID
async function getEpisodeOfCareById(eocId) {
  try {
    const response = await fhirApi.get(`/EpisodeOfCare/${eocId}`);
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("EpisodeOfCare not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create EpisodeOfCare with Specific ID
async function createEpisodeOfCareWithSpecificId(eocData) {
  const eocId = eocData.id;
  if (!eocId) {
    throw new Error("EpisodeOfCare ID is required");
  }
  const fhirEOCResource = {
    resourceType: "EpisodeOfCare",
    ...eocData,
  };
  console.log(`Attempting to PUT EpisodeOfCare to /EpisodeOfCare/${eocId}`);
  try {
    const response = await fhirApi.put(
      `/EpisodeOfCare/${eocId}`,
      fhirEOCResource
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2)
      );

      const issueText = error.response.data.issue
        ? error.response.data.issue
            .map((i) => `${i.diagnostics || i.code}`)
            .join(", ")
        : error.response.statusText;
      throw new Error(`FHIR Validation Failed: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

module.exports = {
  getEpisodeOfCareById,
  createEpisodeOfCareWithSpecificId,
  getEncountersByEpisodeOfCareId,
};
