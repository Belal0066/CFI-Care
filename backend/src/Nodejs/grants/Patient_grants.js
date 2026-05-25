const express = require('express');
const axios = require('axios');

const { requireApiAuth } = require('../middleware/requireApiAuth');

const { logSecurityEvent } = require('../utils/logSecurityEvent');
const {deleteGrant,delCaregiverMappings,getGrant,getPatIentGrants,countCaregiverMappings,getGrantbyKey,deleteGrantbyKey}=require("../services/Grant_Storage_Redis");
const { removeUserFromGroup } = require("../auth/Role_assignment");
const router = express.Router();

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: { 'Content-Type': 'application/fhir+json' },
});

router.delete("/grants/:practitionerId", requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const practitionerId = req.params.practitionerId;
    const key = `grant:${practitionerId}:${patientId}`;
    const grantRaw = await getGrantbyKey(key);
    const grant = grantRaw ? JSON.parse(grantRaw) : null;

    deleteGrantbyKey(key);

    if (grant) {
      await logSecurityEvent('access', 'GRANT_REVOKED', req, {
        patientId,
        practitionerId,
        grantId: grant.grantId,
        reason: 'Patient revoked access grant'
      });
    }

    return res.json({ message: "Grant revoked" });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Grant revoke failed", detail: e.message });
  }
});


// Patient: list all active grants they have issued
router.get('/grants', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const keys = await getPatIentGrants(patientId);
    if (!keys || keys.length === 0) {
      return res.status(200).json({ grants: [] });
    }

    const grants = [];
    for (const key of keys) {
      const raw = await getGrantbyKey(key);
      if (raw) {
        const grant = JSON.parse(raw);
        if (new Date(grant.expiresAt) > new Date()) {
          grants.push(grant);
        } else {
          await deleteGrantbyKey(key);
        }
      }
    }

    return res.status(200).json({ grants });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch grants", detail: e.message });
  }
});


router.delete("/caregivers/:caregiverId", requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;

    if (!patientId) return res.status(401).json({ error: "unauthorized" });

    const caregiverId = req.params.caregiverId;

    const grantKey = `grant:caregiver:${caregiverId}:${patientId}`;
    const grantRaw = await getGrantbyKey(grantKey);
    const grant = grantRaw ? JSON.parse(grantRaw) : null;



    await deleteGrantbyKey(grantKey);
    await delCaregiverMappings(caregiverId, patientId);

    const remaining = countCaregiverMappings(caregiverId);
    if (remaining === 0) {
      await removeUserFromGroup(caregiverId, "Caregiver");
    }

    if (grant) {
      await logSecurityEvent("access", "CAREGIVER_GRANT_REVOKED", req, {
        patientId,
        caregiverId,
        grantId: grant.grantId,
        remainingMappings: remaining,
        reason: "Patient revoked caregiver access",
      });
    }

    return res.json({ message: "Caregiver access revoked" });
  } catch (e) {
    return res.status(500).json({
      error: "Caregiver revoke failed",
      detail: e.message,
    });
  }
});


module.exports = router;