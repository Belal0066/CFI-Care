const express = require("express");
// const axios = require("axios");


const { requireApiAuth } = require("../middleware/requireApiAuth");
const { requireProvisionerClient } = require("../middleware/requireProvisionerClient");
const practitionerService = require("../practioner/practionerService");
const patientService = require("../patient/patientService");


const router = express.Router();

function parseList(v) {
  return String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const browserClients = parseList(process.env.KC_BROWSER_CLIENT_IDS);
const mobileClients = parseList(process.env.KC_MOBILE_CLIENT_IDS);

function resourceTypeFromClientId(registrationClientId) {
  if (browserClients.includes(registrationClientId)) return "Practitioner";
  if (mobileClients.includes(registrationClientId)) return "Patient";
  return null;
}

function buildName(firstName, lastName, fullName) {
  return [
    {
      use: "official",
      family: lastName || "",
      given: [firstName || ""],
      text: fullName || [firstName, lastName].filter(Boolean).join(" ")
    },
  ];
}

function buildResource(resourceType, { userId, email, firstName, lastName, fullName }) {
  return {
    resourceType,
    id: userId,
    active: true,
    name: buildName(firstName, lastName, fullName),
    telecom: [{ system: "email", value: email, use: resourceType === "Practitioner" ? "work" : "mobile" }],
  };
}

async function createFhirByType(resourceType, resource) {
  // try {
  if (resourceType === "Practitioner") {
    await practitionerService.createPractitionerWithSpecificId(resource);
    return;
  }
  if (resourceType === "Patient") {
    await patientService.createPatientWithSpecificId(resource);
    return;
  }
  throw new Error(`unsupported resource type: ${resourceType}`);
}
// catch (err) {
//   console.error("[PROV] failed for user ID = ${resource.} ")
// }
// }

// called by keycloak event-listener 
router.post("/keycloak-register", requireApiAuth, requireProvisionerClient, async (req, res) => {
  // console.log("[PROVISION] Request received:", { url: req.url, body: req.body });
  try {
    const {
      eventType, // must be REGISTER
      userId,
      email,
      firstName,
      lastName,
      fullName,
      registrationClientId
    } = req.body || {};

    // console.log("[PROVISION] Parsed fields:", { eventType, userId, email, registrationClientId });


    if (eventType !== "REGISTER") return res.status(200).json({ ignored: true });


    if (!userId || !email || !registrationClientId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const resourceType = resourceTypeFromClientId(registrationClientId);


    if (!resourceType) {
      return res.status(400).json({ error: "Unknown reg client Id" });
    }

    const resource = buildResource(resourceType, {
      userId, email, firstName, lastName, fullName
    });

    await createFhirByType(resourceType, resource);
    console.log("[PROVISION] SUCCESS for userId:", userId);


    return res.status(200).json({ ok: true, resourceType, fhirId: userId });

  } catch (e) {
    console.error("[PROVISION] failed:", e.response?.data , e.message);
    return res.status(500).json({ error: "provisioning failed" });
  }
});

module.exports = router;