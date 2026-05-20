const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
// const Redis = require('ioredis');

const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

const router = express.Router();
const redis = require('../utils/redisOTPCli');

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: { 'Content-Type': 'application/fhir+json' },
});

router.post('/request-otp', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    // remove any existing otp for user id
    const oldOtp = await redis.get(`user_otp:${patientId}`);
    if (oldOtp) {
      await redis.del(`otp:active:${oldOtp}`);
      await redis.del(`user_otp:${patientId}`);
    }

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

    // send email later? or meh
    res.status(200).json({
      message: "OTP generated successfully",
      otp: otp,
      expiresIn: "10 min",
    });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "OTP request failed", detail: e.message });
  }
});

router.post('/verify-otp', requireApiAuth, async (req, res) => {
  // const practitionerId  = req.session.user?.sub;
  try {
    const practitionerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!practitionerId) return res.status(401).json({ error: "Unauthorized" });

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: "otp is required" });

    const patientId = await redis.getDel(`otp:active:${otp}`);
    if (!patientId)
      return res.status(401).json({ error: "Invalid or expired OTP" });
    await redis.del(`user_otp:${patientId}`);

    const handshakeId = crypto.randomUUID();
    const pending = {
      handshakeId,
      patientId,
      practitionerId,
      createdAt: new Date().toISOString(),
    };

    // hancall func yb3t notif hena -> assigned to the coolest flutter head <3
    
    // TODO: Send an FCM push notification to the patient here so their app
    // receives the access request instantly (type: 'grant_request').
    //
    // Prerequisites:
    //   - The patient's device must have POSTed its FCM token to the backend
    //     after login (see navigation_bar.dart → setupInteractedMessage).
    //   - Store it in Redis when received, e.g.:
    //       redis.set(`fcm_token:${patientId}`, fcmToken)
    //
    // How to send the notification (Firebase Admin SDK):
    //
    //   const admin = require('firebase-admin');          // init once in app.js
    //
    //   const patientFcmToken = await redis.get(`fcm_token:${patientId}`);
    //   if (patientFcmToken) {
    //     await admin.messaging().send({
    //       token: patientFcmToken,
    //       data: { type: 'grant_request', handshakeId },   // data-only message
    //       notification: {                                  // shown in system tray
    //         title: 'Access Request',
    //         body:  'A doctor is requesting access to your health data.',
    //       },
    //       android: { priority: 'high' },
    //       apns:    { payload: { aps: { contentAvailable: true } } },
    //     });
    //   }

    await redis.set(
      `pending_grant:${handshakeId}`,
      JSON.stringify(pending),
      "EX",
      600,
    );
    await redis.sAdd(`patient_pending:${patientId}`, handshakeId);
    await redis.expire(`patient_pending:${patientId}`, 120);

    // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

    return res.status(200).json({
      message: "OTP verified. Waiting for patient approval.",
      handshakeId,
      targetpatientId: patientId,
      expiresIn: "10 min",
    });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "OTP verification failed", detail: e.message });
  }
});

// after patient reply
router.post('/grants', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    // const {durationMinutes, approved, otp }= req.body;
    const { handshakeId, approved, durationMinutes, scopes } = req.body || {};
    if (!handshakeId)
      return res.status(400).json({ error: "handshakeId is required" });

    const pendingRaw = await redis.get(`pending_grant:${handshakeId}`);
    if (!pendingRaw)
      return res
        .status(404)
        .json({ error: "Pending request expired or not found" });

    const pending = JSON.parse(pendingRaw);
    if (pending.patientId !== patientId) {
      return res
        .status(403)
        .json({
          error: "Forbidden: pending request does not belong to this patient",
        });
    }

    if (!approved) {
      // await redis.del(`pending:${patientId}`);
      // await redis.del(`otp:${otp}`)
      await redis.del(`pending_grant:${handshakeId}`);
      await redis.sRem(`patient_pending:${patientId}`, handshakeId);

      await logSecurityEvent('access', 'GRANT_ACCESS_DENIED', req, {
        patientId,
        practitionerId: pending.practitionerId,
        handshakeId,
        reason: 'Patient denied access request'
      });

      return res.status(200).json({ message: "Patient denied access request" });
    }

    if (!durationMinutes || durationMinutes < 1) {
      return res.status(400).json({ error: 'Duration must be greater than 1' });
    }

    // create grant
    const grantId = crypto.randomUUID();
    const ttlSeconds = durationMinutes * 60;
    const now = Date.now();

    const practitionerId = pending.practitionerId

    const grant = {
      grantId,
      patientId,
      practitionerId: practitionerId,
      status: "active",
      scopes:
        Array.isArray(scopes) && scopes.length
          ? scopes
          : ["read"],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),

      // ,scope:
    };

    // store Consent in redis (Capability Token)
    await redis.set(
      `grant:${practitionerId}:${patientId}`,
      JSON.stringify(grant),
      'EX',
      ttlSeconds,
    );

    // delete otp
    // await redis.del(`otp:${otp}`)

    await redis.del(`pending_grant:${handshakeId}`);
    await redis.sRem(`patient_pending:${patientId}`, handshakeId);

    await logSecurityEvent('consent', 'CONSENT_APPROVED', req, {
      patientId,
      practitionerId: pending.practitionerId,
      handshakeId,
      reason: 'Patient approved access grant'
    });

    await logSecurityEvent('access', 'GRANT_ISSUED', req, {
      patientId,
      practitionerId: pending.practitionerId,
      grantId,
      durationMinutes,
      reason: 'Access grant issued to practitioner'
    });

    return res.status(201).json({
      message: "Consent granted",
      grant
    });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "grant issuance failed", detail: e.message });
  }
});

router.delete("/grants/:practitionerId", requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const practitionerId = req.params.practitionerId;
    const key = `grant:${practitionerId}:${patientId}`;
    // await redis.del(key);
    const grantRaw = await redis.get(key);
    const grant = grantRaw ? JSON.parse(grantRaw) : null;

    await redis.del(key);

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

// Patient: list all pending grant requests waiting for their approval
router.get('/pending', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const handshakeIds = await redis.sMembers(`patient_pending:${patientId}`);
    if (!handshakeIds || handshakeIds.length === 0) {
      return res.status(200).json({ pending: [] });
    }

    const pending = [];
    for (const handshakeId of handshakeIds) {
      const raw = await redis.get(`pending_grant:${handshakeId}`);
      if (raw) {
        pending.push(JSON.parse(raw));
      } else {
        // expired — clean up the set
        await redis.sRem(`patient_pending:${patientId}`, handshakeId);
      }
    }

    return res.status(200).json({ pending });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch pending grants", detail: e.message });
  }
});

// Patient: list all active grants they have issued
router.get('/grants', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const keys = await redis.keys(`grant:*:${patientId}`);
    if (!keys || keys.length === 0) {
      return res.status(200).json({ grants: [] });
    }

    const grants = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) {
        const grant = JSON.parse(raw);
        if (new Date(grant.expiresAt) > new Date()) {
          grants.push(grant);
        } else {
          await redis.del(key);
        }
      }
    }

    return res.status(200).json({ grants });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch grants", detail: e.message });
  }
});

// Practitioner: list all patients who have granted them access
router.get('/my-patients', requireApiAuth, async (req, res) => {
  try {
    const practitionerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!practitionerId) return res.status(401).json({ error: 'Unauthorized' });

    const keys = await redis.keys(`grant:${practitionerId}:*`);
    if (!keys || keys.length === 0) {
      return res.status(200).json({ patients: [] });
    }

    const patients = [];
    for (const key of keys) {
      const grantRaw = await redis.get(key);
      if (!grantRaw) continue;
      const grant = JSON.parse(grantRaw);
      if (!grant?.patientId || new Date(grant.expiresAt) <= new Date()) {
        await redis.del(key);
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

// Practitioner: poll whether patient approved a specific handshake
router.get('/status/:handshakeId', requireApiAuth, async (req, res) => {
  try {
    const practitionerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!practitionerId) return res.status(401).json({ error: "Unauthorized" });

    const { handshakeId } = req.params;
    const pendingRaw = await redis.get(`pending_grant:${handshakeId}`);

    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending.practitionerId !== practitionerId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ status: "pending", handshakeId });
    }

    // pending_grant is gone — check if an active grant was issued
    const patientId = req.query.patientId;
    if (patientId) {
      const grantRaw = await redis.get(`grant:${practitionerId}:${patientId}`);
      if (grantRaw) {
        const grant = JSON.parse(grantRaw);
        if (new Date(grant.expiresAt) > new Date()) {
          return res.status(200).json({ status: "approved", grant });
        }
      }
    }

    return res.status(200).json({ status: "expired" });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch status", detail: e.message });
  }
});

module.exports = router;
