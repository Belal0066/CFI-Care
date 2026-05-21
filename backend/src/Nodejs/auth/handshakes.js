const express = require('express');
const crypto = require('crypto');
// const Redis = require('ioredis');

const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

const router = express.Router();
const redis = require('../utils/redisOTPCli');

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

    await redis.set(
      `pending_grant:${handshakeId}`,
      JSON.stringify(pending),
      'EX',
      600,
    );
    await redis.sAdd(`patient_pending:${patientId}`, handshakeId);
    await redis.expire(`patient_pending:${patientId}`, 120);

    // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

    return res.status(200).json({
      message: "OTP verified. Waiting for patient approval.",
      handshakeId,
      targetpatientId: patientId,
      expiresIn: "10 min"
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
          : [`${patientId}/*.read`],
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

module.exports = router;