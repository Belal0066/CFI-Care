const crypto = require("crypto");
const redis = require("../utils/redisOTPCli");

// store Consent in redis (Capability Token)
async function saveGrant(grant) {
    // check reundancy in case multiple requests have been made 
    
    const existing = await getGrant(grant.requesterType, grant.requesterId, grant.patientId);
    if (existing) {
        await deleteGrant(grant.requesterType, grant.requesterId, grant.patientId);
    }
    const key = `grant:${grant.requesterType}:${grant.requesterId}:${grant.patientId}`;
    await redis.set(key, JSON.stringify(grant), "EX", grant.ttlSeconds);
    return key;

}

async function getGrant(requesterType, requesterId, patientId) {
    const key = `grant:${requesterType}:${requesterId}:${patientId}`;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
}

async function deleteGrant(requesterType, requesterId, patientId) {
    const key = `grant:${requesterType}:${requesterId}:${patientId}`;
    // const raw = await redis.get(key);
    // const grant = raw ? JSON.parse(raw) : null;
    await redis.del(key);
    // return grant;
}

async function getPractitionerGrants(practitionerId) {
  const keys = await redis.keys(`grant:practitioner:${practitionerId}:*`);
  return keys;
}

async function getCaregiverGrants(caregiverId) {
    const patientIds= await redis.sMembers(`caregiver_patients:${caregiverId}`);
    return patientIds;
    
}

async function getPatIentGrants(patientId) {
    const keys= await redis.keys(`grant:*:${patientId}`);
    return keys;
    
}

async function setCaregiverMappings(requesterId, patientId) {
    await redis.sAdd(`caregiver_patients:${requesterId}`, patientId);

}
async function delCaregiverMappings(caregiverId, patientId) {
    await redis.sRem(`caregiver_patients:${caregiverId}`, patientId);

}

async function countCaregiverMappings(caregiverId) {
    const remaining = await redis.sCard(`caregiver_patients:${caregiverId}`);
    return remaining;
}


// overloads for grant input because js is silly and doesn't do overloads :p

async function getGrantbyKey(key) {
    const grantRaw = await redis.get(key);
    return grantRaw;
}

async function deleteGrantbyKey(key) {
    await redis.del(key);
}


async function getGrantByRequesterAndPatient(requesterId, patientId) {
  const keys = await redis.keys(`grant:*:${requesterId}:${patientId}`);
  if (!keys || keys.length === 0) return null;

  const raw = await redis.get(keys[0]);
  return raw ? JSON.parse(raw) : null;
}

async function getPatientCaregiversList(patientId) {
  const keys = await redis.keys(`grant:caregiver:*:${patientId}`);
  const now = new Date();
  const caregiverIds = [];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const grant = JSON.parse(raw);
    if (grant?.expiresAt && new Date(grant.expiresAt) > now) {
      caregiverIds.push(grant.requesterId);
    }
  }
  return caregiverIds;
}

module.exports = {
    saveGrant,
    getGrant,
    deleteGrant,
    getPractitionerGrants,
    getPatIentGrants,
    setCaregiverMappings,
    delCaregiverMappings,
    countCaregiverMappings,
    getGrantbyKey,
    deleteGrantbyKey,
    getGrantByRequesterAndPatient,
    getCaregiverGrants,
    getPatientCaregiversList
};