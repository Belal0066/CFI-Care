const { getPatientCaregiversList } = require('./Grant_Storage_Redis');
const { sendDataUpdatedByCaregiver, sendDataUpdatedByPatient } = require('./FCM_Send_Notification');

function _writerName(jwt) {
  if (!jwt) return 'Unknown';
  const given = jwt.given_name || '';
  const family = jwt.family_name || '';
  if (given || family) return `${given} ${family}`.trim();
  return jwt.name || 'Unknown';
}

async function notifyDataUpdate(req, patientId) {
  const writerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
  if (!writerId || !patientId) return;

  const writerName = _writerName(req.jwt || req.kauth?.token?.grant);

  if (writerId !== patientId) {
    // A caregiver (or someone else) updated this patient's data → notify the patient.
    // We compare IDs instead of checking the JWT role because a caregiver's JWT still
    // shows "patient" role until their token is refreshed after onboarding.
    await sendDataUpdatedByCaregiver(patientId, writerName);
  } else {
    // The patient updated their own data → notify all active caregivers.
    const caregiverIds = await getPatientCaregiversList(patientId);
    if (caregiverIds.length > 0) {
      await sendDataUpdatedByPatient(caregiverIds, writerName);
    }
  }
}

module.exports = { notifyDataUpdate };
