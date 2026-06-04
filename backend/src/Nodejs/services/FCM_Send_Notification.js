const redis = require('../utils/redisOTPCli');
const admin = require('firebase-admin');

async function _sendToUser(userId, data, notification) {
  const token = await redis.get(`fcm_token:${userId}`);
  if (!token) return;
  try {
    await admin.messaging().send({
      token,
      data,
      notification,
      android: { priority: 'high' },
      apns: { payload: { aps: { contentAvailable: true } } },
    });
  } catch (err) {
    console.error(`[FCM] failed to send to ${userId}:`, err.message);
  }
}

const bodyByType = {
  practitioner: 'A practitioner is requesting access to your health data.',
  caregiver: 'A caregiver is requesting access to your health data.',
};

async function sendNotif(patientId, handshakeId, requesterType) {
  // Use 'family_request' for caregivers so the Flutter app can distinguish
  // family requests from doctor (practitioner) requests.
  const type = requesterType === 'caregiver' ? 'family_request' : 'grant_request';
  await _sendToUser(
    patientId,
    { type, handshakeId },
    { title: 'Access Request', body: bodyByType[requesterType] ?? 'Someone is requesting access to your health data.' }
  );
}

async function sendGrantApprovalNotif(requesterId, patientDisplayName) {
  const body = patientDisplayName
    ? `${patientDisplayName} approved your access request.`
    : 'Your access request has been approved.';
  await _sendToUser(
    requesterId,
    { type: 'grant_approved' },
    { title: 'Access Approved', body }
  );
}

async function sendDataUpdatedByCaregiver(patientId, caregiverName) {
  await _sendToUser(
    patientId,
    { type: 'data_updated' },
    { title: 'Data Updated', body: `Your data was updated by ${caregiverName}.` }
  );
}

async function sendDataUpdatedByPatient(caregiverIds, patientName) {
  for (const caregiverId of caregiverIds) {
    await _sendToUser(
      caregiverId,
      { type: 'data_updated' },
      { title: 'Data Updated', body: `${patientName} updated their data.` }
    );
  }
}

// Notify a caregiver (Y) that a patient (X) revoked their access, so Y's app
// can drop X from the accessible list and exit proxy mode if viewing X.
async function sendAccessRevokedNotif(caregiverId, patientId, patientName) {
  const body = patientName
    ? `${patientName} revoked your access to their data.`
    : 'Your access to a patient was revoked.';
  await _sendToUser(
    caregiverId,
    { type: 'access_revoked', patientId: String(patientId) },
    { title: 'Access Revoked', body }
  );
}

module.exports = { sendNotif, sendGrantApprovalNotif, sendDataUpdatedByCaregiver, sendDataUpdatedByPatient, sendAccessRevokedNotif };