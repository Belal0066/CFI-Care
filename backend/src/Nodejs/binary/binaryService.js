const axios = require("axios");
const fs = require("fs");
const pdf2base64 = require("pdf-to-base64");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// async function convertPdfToBase64(file) {
//   try {
//     // Note: This requires the file to exist on the SERVER'S file system
//     const pdfData = await pdf2base64(file);
//     return pdfData.toString("base64");
//   } catch (error) {
//     console.error("File Read Error:", error.message);
//     throw new Error("Could not read the PDF file at path: " + file);
//   }
// }

// Create PDF Binary Resource and change to base64
async function createPDFBinaryResource(
  file,
  id,
  contentType = "application/pdf"
) {
  const base64Data = await pdf2base64(file);

  const binaryResource = {
    resourceType: "Binary",
    id: id,
    contentType: contentType,
    data: base64Data,
  };

  try {
    const response = await fhirApi.put(`/Binary/${id}`, binaryResource);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
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

// Get PDF Binary Resource by ID
async function getPDFBinaryResource(id) {
  try {
    const response = await fhirApi.get(`/Binary/${id}`);
    const base64Data = response.data;
    fs.writeFileSync(`./${id}.pdf`, base64Data.data, {
      encoding: "base64",
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching Binary resource:", error.message);
    throw new Error("Could not fetch the Binary resource with ID: " + id);
  }
}

module.exports = {
  // convertPdfToBase64,
  createPDFBinaryResource,
  getPDFBinaryResource,
};
