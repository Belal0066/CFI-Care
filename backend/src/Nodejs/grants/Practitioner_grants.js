const express = require('express');
const axios = require('axios');

const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

const { resolveRequesterType } = require('../services/Caller_Role_resolver');
const { clearExistingOtp, createUniqueOtp, ClearVerifiedOtp, savePendingGrant, getPendingGrant, listPendingHandshakes, deletePendingGrant} = require('../services/Handshake_storage_redis');
const { saveGrant,
  getGrant,
  getPractitionerGrants,
  setCaregiverMappings,getGrantbyKey,
    deleteGrantbyKey} = require("../services/Grant_Storage_Redis");


const router = express.Router();

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: { 'Content-Type': 'application/fhir+json' },
});



// Practitioner: list all patients who have granted them access
router.get('/my-patients', requireApiAuth, async (req, res) => {
  try {
    const practitionerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!practitionerId) return res.status(401).json({ error: 'Unauthorized' });

    const keys = await getPractitionerGrants(practitionerId);
    if (!keys || keys.length === 0) {
      return res.status(200).json({ patients: [] });
    }

    const patients = [];
    for (const key of keys) {
      const grantRaw = await getGrantbyKey(key);
      if (!grantRaw) continue;
      const grant = JSON.parse(grantRaw);
      if (!grant?.patientId || new Date(grant.expiresAt) <= new Date()) {
        await deleteGrantbyKey(key);
        continue;
      }
      try {
        const fhirRes = await fhirApi.get(`/Patient/${grant.patientId}`);
        const p = fhirRes.data;
        const namePart = p.name?.[0];
        const fullName = namePart
          ? `${namePart.given?.join(' ') || ''} ${namePart.family || ''}`.trim()
          : 'Unknown';
        let age = null;
        if (p.birthDate) {
          const bd = new Date(p.birthDate);
          const today = new Date();
          age = today.getFullYear() - bd.getFullYear();
          const m = today.getMonth() - bd.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
        }
        patients.push({
          id: grant.patientId,
          name: fullName,
          age,
          lastUpdated: p.meta?.lastUpdated || grant.createdAt,
          grantExpiresAt: grant.expiresAt,
        });
      } catch (_) {
        // patient not in FHIR — skip
      }
    }

    return res.status(200).json({ patients });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch granted patients', detail: e.message });
  }
});


module.exports = router;