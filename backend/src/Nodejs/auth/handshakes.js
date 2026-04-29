const express = require('express');
const crypto = require('crypto');
const Redis = require('ioredis');


const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

// const router = express.Router();
// const redis = new Redis(process.env.REDIS_URL);



router.post('/request-otp', requireApiAuth, async (req, res) => {
    try {
        const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
        if (!patientId) return res.status(401).json({ error: "Unauthorized" });


        const otp = crypto.randomInt(100000, 999999).toString();
        // 10 mins
        await redis.set(`otp:${otp}`, patientId, 'EX', 600);

        // send email later?
        res.status(200).json({
            message: "OTP generated successfully",
            otp: otp,
            expiresIn: "10 min"
        });
    } catch (e) {
        return res.status(500).json({ error: "OTP request failed", detail: e.message });
    }
});


router.post('/verify-otp', requireApiAuth, async (req, res) => {
    // const practitionerId  = req.session.user?.sub;
    try {
        const practitionerId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
        if (!practitionerId) return res.status(401).json({ error: "Unauthorized" });

        const { otp } = req.body || {};
        if (!otp) return res.status(400).json({ error: "otp is required" });

        const patientId = await redis.getdel(`otp:${otp}`);
        if (!patientId) return res.status(401).json({ error: "Invalid or expired OTP" });

        const handshakeId = crypto.randomUUID();
        const pending = {
            handshakeId,
            patientId,
            practitionerId,
            createdAt: new Date().toISOString()
        };

        // hancall func yb3t notif hena
        await redis.set(`pending_grant:${handshakeId}`, JSON.stringify(pending), 'EX', 120);
        await redis.sadd(`patient_pending:${patientId}`, handshakeId);
        await redis.expire(`patient_pending:${patientId}`, 120);


        // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

        return res.status(200).json({
            message: "OTP verified. Waiting for patient approval.",
            handshakeId,
            targetPatientId: patientId,
            expiresIn: "2 min"
        });
    } catch (e) {
        return res.status(500).json({ error: "OTP verification failed", detail: e.message });
    }
});



// after patient reply
router.post('/grants', requireApiAuth, async (req, res) => {
    try {
        const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
        if (!patientId) return res.status(401).json({ error: "Unauthorized" });

        // const {durationMinutes, approved, otp }= req.body;
        const { handshakeId, approved, durationMinutes, scopes } = req.body || {};
        if (!handshakeId) return res.status(400).json({ error: "handshakeId is required" });

        const pendingRaw = await redis.get(`pending_grant:${handshakeId}`);
        if (!pendingRaw) return res.status(404).json({ error: "Pending request expired or not found" });

        const pending = JSON.parse(pendingRaw);
        if (pending.patientId !== patientId) {
            return res.status(403).json({ error: "Forbidden: pending request does not belong to this patient" });
        }

        if (!approved) {
            // await redis.del(`pending:${patientId}`);
            // await redis.del(`otp:${otp}`)
            await redis.del(`pending_grant:${handshakeId}`);
            await redis.srem(`patient_pending:${patientId}`, handshakeId);

            await logSecurityEvent('access', 'GRANT_ACCESS_DENIED', req, {
                patientId,
                practitionerId: pending.practitionerId,
                handshakeId,
                reason: 'Patient denied access request'
            });

            return res.status(200).json({ message: "Access denied by patient" });
        }

        if (!durationMinutes || durationMinutes < 1 || durationMinutes > 720) {
            return res.status(400).json({ error: "durationMinutes must be between 1 and 720" });
        }

        // create grant
        const grantId = crypto.randomUUID();
        const ttlSeconds = durationMinutes * 60;
        const now = Date.now();

        const grant = {
            grantId,
            patientId,
            practitionerId: pending.practitionerId,
            status: "active",
            scopes: Array.isArray(scopes) && scopes.length ? scopes : [`${patientId}/*.read`],
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + ttlSeconds * 1000).toISOString()

            // ,scope:
        };

        // store Consent in redis (Capability Token)
        await redis.set(`grant:${practitionerId}:${patientId}`, JSON.stringify(grant), 'EX', ttlSeconds);

        // delete otp
        // await redis.del(`otp:${otp}`)

        await redis.set(`grant:${pending.practitionerId}:${patientId}`, JSON.stringify(grant), 'EX', ttlSeconds);
        await redis.del(`pending_grant:${handshakeId}`);
        await redis.srem(`patient_pending:${patientId}`, handshakeId);

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
        return res.status(500).json({ error: "grant issuance failed", detail: e.message });
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
        return res.status(500).json({ error: "Grant revoke failed", detail: e.message });
    }
});

module.exports = router;