const express = require('express');
const router = express.Router();
const { requireApiAuth } = require('../middleware/requireApiAuth');

const redis = require('../utils/redisOTPCli');
// Called by Flutter after login — stores device FCM token in Redis
router.post('/fcm-token', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: 'Unauthorized' });

    const { fcmToken } = req.body || {};
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken is required' });

    await redis.set(`fcm_token:${patientId}`, fcmToken);
    return res.status(200).json({ message: 'FCM token stored' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to store FCM token', detail: e.message });
  }
});

module.exports = router;