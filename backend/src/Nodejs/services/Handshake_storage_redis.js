const crypto = require("crypto");
const redis = require("../utils/redisOTPCli");

async function clearExistingOtp(patientId) {
  const oldOtp = await redis.get(`user_otp:${patientId}`);
  if (oldOtp) {
    await redis.del(`otp:active:${oldOtp}`);
    await redis.del(`user_otp:${patientId}`);
  }
}

async function createUniqueOtp(patientId) {
  let otp;
  let success = false;
  let attempts = 0;

  // 10 trials to get a unique otp
  while (!success && attempts < 10) {
    otp = crypto.randomInt(100000, 999999).toString();

    // NX = Set only if key does not exist
    // 10 min
    const result = await redis.set(
      `otp:active:${otp}`,
      patientId,
      'NX',
      'EX',
      600,
    );
    if (result === 'OK') {
      success = true;

      // for tracking user mapped otp
      await redis.set(`user_otp:${patientId}`, otp, 'EX', 600);
    }
    attempts++;
  }

  if (!success) throw new Error("Collision threshold reached");
  // const otp = crypto.randomInt(100000, 999999).toString();
  // // 10 mins
  // await redis.set(`otp:${otp}`, patientId, 'EX', 600);


  return otp;
}

async function ClearVerifiedOtp(otp) {
  const patientId = await redis.getDel(`otp:active:${otp}`);
  if (!patientId) {
    return null;
  }
  await redis.del(`user_otp:${patientId}`);
  return patientId;
}

async function savePendingGrant(pending) {
  const { handshakeId, patientId } = pending;
  await redis.set(
    `pending_grant:${handshakeId}`,
    JSON.stringify(pending),
    "EX",
    600,
  );
  await redis.sAdd(`patient_pending:${patientId}`, handshakeId);
  await redis.expire(`patient_pending:${patientId}`, 120);

}

async function getPendingGrant(handshakeId) {
  const pendingRaw = await redis.get(`pending_grant:${handshakeId}`);
  return pendingRaw;
}

async function listPendingHandshakes(patientId) {
  const handsshakes = await redis.sMembers(`patient_pending:${patientId}`);
  return handsshakes;
}

async function deletePendingGrant(handshakeId, patientId) {
  await redis.del(`pending_grant:${handshakeId}`);
  await redis.sRem(`patient_pending:${patientId}`, handshakeId);

}


module.exports = {
  clearExistingOtp,
  createUniqueOtp,
  ClearVerifiedOtp,
  savePendingGrant,
  getPendingGrant,
  listPendingHandshakes,
  deletePendingGrant,
};