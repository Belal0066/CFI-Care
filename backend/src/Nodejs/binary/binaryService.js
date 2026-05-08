const axios = require("axios");
const fs = require("fs");
const pdf2base64 = require("pdf-to-base64");
const {
  getFromCache,
  setInCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");
// const {
//   handleAwsPdfPipeline,
//   isAwsPipelineEnabled,
// } = require("../utils/awsPdfPipeline");

function logBinaryStatus(action, status, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.log(`[binary] action=${action} status=${status}${suffix}`);
}

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

function normalizeBase64Data(data) {
  if (!data || typeof data !== "string") return null;
  const commaIdx = data.indexOf(",");
  return commaIdx >= 0 ? data.slice(commaIdx + 1) : data;
}

function normalizeContentType(contentType) {
  return contentType || "application/pdf";
}

async function resolveBinaryData(file, data, uploadedPdf) {
  if (uploadedPdf && uploadedPdf.buffer && uploadedPdf.buffer.length > 0) {
    return uploadedPdf.buffer.toString("base64");
  }
  if (data) {
    return normalizeBase64Data(data);
  }
  if (file) {
    return pdf2base64(file);
  }
  throw new Error(
    "Either multipart pdf, file path, or base64 data is required",
  );
}

// Create Binary resource from file path or base64
async function createPDFBinaryResource(
  file,
  id,
  contentType = "application/pdf",
  data,
  uploadedPdf,
  patientId,
  documentReferenceId,
) {
  const resolvedContentType = normalizeContentType(contentType);
  const base64Data = await resolveBinaryData(file, data, uploadedPdf);

  const binaryResource = {
    resourceType: "Binary",
    id: id,
    contentType: resolvedContentType,
    data: base64Data,
  };

  let response;

  try {
    response = await fhirApi.put(`/Binary/${id}`, binaryResource);
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      const issueText = error.response.data.issue
        ? error.response.data.issue
            .map((i) => `${i.diagnostics || i.code}`)
            .join(", ")
        : error.response.statusText;
      throw new Error(`FHIR Validation Failed: ${issueText}`);
    }

    console.error("FHIR Network/Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }

  // AWS PDF pipeline disabled
  // if (isAwsPipelineEnabled() && resolvedContentType.includes("pdf")) {
  //   try {
  //     if (!documentReferenceId) {
  //       throw new Error(
  //         "documentReferenceId is required for AWS pipeline S3 naming and SQS payload",
  //       );
  //     }
  //     logBinaryStatus(
  //       "AWS_PIPELINE_CREATE",
  //       "STARTED",
  //       `binaryId=${id} patientId=${patientId || "n/a"} documentReferenceId=${documentReferenceId}`,
  //     );
  //     const pdfBuffer = uploadedPdf?.buffer
  //       ? uploadedPdf.buffer
  //       : Buffer.from(base64Data, "base64");
  //     const awsResult = await handleAwsPdfPipeline({
  //       pdfId: id,
  //       patientId,
  //       documentReferenceId,
  //       pdfBuffer,
  //       contentType: resolvedContentType,
  //     });
  //     if (awsResult) {
  //       logBinaryStatus(
  //         "AWS_PIPELINE_CREATE",
  //         "SUCCESS",
  //         `binaryId=${id} documentReferenceId=${documentReferenceId} s3Uri=s3://${awsResult.bucket}/${awsResult.key} sqsMessageId=${awsResult.messageId}`,
  //       );
  //     }
  //   } catch (error) {
  //     console.error(
  //       `[binary] action=AWS_PIPELINE_CREATE status=FAILED binaryId=${id} documentReferenceId=${documentReferenceId || "n/a"} error=${error.message}`,
  //     );
  //     throw new Error(`AWS PDF pipeline failed: ${error.message}`);
  //   }
  // }

  // Invalidate cache after successful creation
  await deleteFromCache(`binary:${id}`);

  return response.data;
}

// Get PDF Binary Resource by ID
async function getPDFBinaryResource(id) {
  const cacheKey = `binary:${id}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      // Write cached data to file
      fs.writeFileSync(`./${id}.pdf`, cachedData.data, {
        encoding: "base64",
      });
      return cachedData;
    }

    const response = await fhirApi.get(`/Binary/${id}`);
    const base64Data = response.data;

    // Store in cache
    await setInCache(cacheKey, base64Data, CACHE_EXPIRATION.BINARY);

    // Write to file
    fs.writeFileSync(`./${id}.pdf`, base64Data.data, {
      encoding: "base64",
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching Binary resource:", error.message);
    throw new Error("Could not fetch the Binary resource with ID: " + id);
  }
}

// Update Binary resource
async function updateBinary(
  binaryId,
  file,
  contentType = "application/pdf",
  data,
  uploadedPdf,
  patientId,
  documentReferenceId,
) {
  if (!binaryId) {
    throw new Error("Binary ID is required");
  }

  // Get existing binary
  try {
    await getPDFBinaryResource(binaryId);
  } catch (error) {
    throw new Error(`Binary ${binaryId} not found`);
  }

  const resolvedContentType = normalizeContentType(contentType);
  const base64Data = await resolveBinaryData(file, data, uploadedPdf);

  const updateData = {
    resourceType: "Binary",
    id: binaryId,
    contentType: resolvedContentType,
    data: base64Data,
  };

  let response;

  try {
    response = await fhirApi.put(`/Binary/${binaryId}`, updateData);
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      const issueText = error.response.data.issue
        ? error.response.data.issue
            .map((i) => `${i.diagnostics || i.code}`)
            .join(", ")
        : error.response.statusText;
      throw new Error(`FHIR Validation Failed: ${issueText}`);
    }

    console.error("FHIR Network/Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }

  // AWS PDF pipeline disabled
  // if (isAwsPipelineEnabled() && resolvedContentType.includes("pdf")) {
  //   try {
  //     if (!documentReferenceId) {
  //       throw new Error(
  //         "documentReferenceId is required for AWS pipeline S3 naming and SQS payload",
  //       );
  //     }
  //     logBinaryStatus(
  //       "AWS_PIPELINE_UPDATE",
  //       "STARTED",
  //       `binaryId=${binaryId} patientId=${patientId || "n/a"} documentReferenceId=${documentReferenceId}`,
  //     );
  //     const pdfBuffer = uploadedPdf?.buffer
  //       ? uploadedPdf.buffer
  //       : Buffer.from(base64Data, "base64");
  //     const awsResult = await handleAwsPdfPipeline({
  //       pdfId: binaryId,
  //       patientId,
  //       documentReferenceId,
  //       pdfBuffer,
  //       contentType: resolvedContentType,
  //     });
  //     if (awsResult) {
  //       logBinaryStatus(
  //         "AWS_PIPELINE_UPDATE",
  //         "SUCCESS",
  //         `binaryId=${binaryId} documentReferenceId=${documentReferenceId} s3Uri=s3://${awsResult.bucket}/${awsResult.key} sqsMessageId=${awsResult.messageId}`,
  //       );
  //     }
  //   } catch (error) {
  //     console.error(
  //       `[binary] action=AWS_PIPELINE_UPDATE status=FAILED binaryId=${binaryId} documentReferenceId=${documentReferenceId || "n/a"} error=${error.message}`,
  //     );
  //     throw new Error(`AWS PDF pipeline failed: ${error.message}`);
  //   }
  // }

  // Invalidate cache after successful update
  await deleteFromCache(`binary:${binaryId}`);

  return response.data;
}

// Delete Binary resource
async function deleteBinary(binaryId) {
  if (!binaryId) {
    throw new Error("Binary ID is required");
  }

  try {
    // Delete from FHIR server
    await fhirApi.delete(`/Binary/${binaryId}`);

    // Invalidate cache after successful deletion
    await deleteFromCache(`binary:${binaryId}`);

    return { success: true, id: binaryId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Binary ${binaryId} not found in FHIR`);
      await deleteFromCache(`binary:${binaryId}`);
      return { success: true, id: binaryId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete binary.");
  }
}

module.exports = {
  // convertPdfToBase64,
  createPDFBinaryResource,
  getPDFBinaryResource,
  updateBinary,
  deleteBinary,
};
