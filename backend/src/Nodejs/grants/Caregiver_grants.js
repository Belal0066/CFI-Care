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



module.exports = router;