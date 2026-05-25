const crypto = require("crypto");
const redis = require("../utils/redisOTPCli");

async function saveGrant(grant) {
    // store Consent in redis (Capability Token)
    const key = `grant:${grant.requesterType}:${grant.requesterId}:${grant.patientId}`;
    await redis.set(key, JSON.stringify(grant), "EX", grant.ttlSeconds);
    return key;


    // await redis.set(
    //   `grant:${practitionerId}:${patientId}`,
    //   JSON.stringify(grant),
    //   'EX',
    //   ttlSeconds,
    // );

}

async function getGrant(requesterType, requesterId, patientId) {
    const key = `grant:${requesterType}:${requesterId}:${patientId}`;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
}

async function deleteGrant(requesterType, requesterId, patientId) {
    const key = `grant:${requesterType}:${requesterId}:${patientId}`;
    const raw = await redis.get(key);
    const grant = raw ? JSON.parse(raw) : null;
    await redis.del(key);
    return grant;
}

async function getPractitionerGrants(practitionerId) {
    const keys = await redis.keys(`grant:${practitionerId}:*`);
    return keys;
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
// overloads for grant input :p

async function getGrantbyKey(key) {
    const grantRaw = await redis.get(key);
    return grantRaw;
}

async function deleteGrantbyKey(key) {
    await redis.del(key);
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
    deleteGrantbyKey
};