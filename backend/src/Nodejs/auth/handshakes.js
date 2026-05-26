const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
// const Redis = require('ioredis');

const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

const router = express.Router();
const redis = require('../utils/redisOTPCli');

const { sendNotif } = require('../services/FCM_Send_Notification');
const { resolveRequesterType } = require('../services/Caller_Role_resolver');
const { clearExistingOtp, createUniqueOtp, ClearVerifiedOtp, savePendingGrant, getPendingGrant, listPendingHandshakes, deletePendingGrant } = require('../services/Handshake_storage_redis');
const { saveGrant,
  getGrant,
  setCaregiverMappings, getGrantByRequesterAndPatient } = require("../services/Grant_Storage_Redis");
const { addUserToGroup } = require("./Role_assignment");


router.post('/request-otp', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    // remove any existing otp for user id
    await clearExistingOtp(patientId);

    //create unique otp, tries rand values uniqueness up to 10 times
    const otp = await createUniqueOtp(patientId);


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

router.post('/verify-practitioner-otp', requireApiAuth, async (req, res) => {
  // const practitionerId  = req.session.user?.sub;
  try {
    const requesterId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!requesterId) return res.status(401).json({ error: "Unauthorized" });

    const requesterType = resolveRequesterType(req.jwt || req.kauth?.token?.grant);

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: "otp is required" });

    const patientId = await ClearVerifiedOtp(otp);
    if (!patientId)
      return res.status(401).json({ error: "Invalid or expired OTP" });

    const handshakeId = crypto.randomUUID();
    const pending = {
      handshakeId,
      patientId,
      requesterId,
      requesterType: requesterType,
      createdAt: new Date().toISOString(),
    };

    // hancall func yb3t notif hena -> assigned to the coolest flutter head <3
    await sendNotif(patientId, handshakeId, requesterType);


    // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

    await savePendingGrant(pending);

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

router.post('/verify-caregiver-otp', requireApiAuth, async (req, res) => {

  try {
    const requesterId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!requesterId) return res.status(401).json({ error: "Unauthorized" });

    const requesterType = resolveRequesterType(req.jwt || req.kauth?.token?.grant);

    // to dynamically add caregiver user role caregiver , dk if there's a better appraoch this is the best i could come up with :/
    // let caregiverRoleAssignment =null;
    // if (requesterType!= "caregiver"){
    //   caregiverRoleAssignment="caregiver_onboarding";
    // }else{
    //   caregiverRoleAssignment="caregiver_assigned";
    // }

    const caregiverRoleAssignment = requesterType === "caregiver"
      ? "caregiver_assigned" : "caregiver_onboarding";


    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: "otp is required" });

    const patientId = await ClearVerifiedOtp(otp);
    if (!patientId)
      return res.status(401).json({ error: "Invalid or expired OTP" });

    const handshakeId = crypto.randomUUID();
    const pending = {
      handshakeId,
      patientId,
      requesterId,
      requesterType: requesterType,
      caregiverRoleAssignment,
      createdAt: new Date().toISOString(),
    };

    // hancall func yb3t notif hena -> assigned to the coolest flutter head <3
    await sendNotif(patientId, handshakeId, requesterType);


    // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

    await savePendingGrant(pending);

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
router.post('/create-grant', requireApiAuth, async (req, res) => {
  try {
    // const requesterType = resolveRequesterType(req.jwt || req.kauth?.token?.grant);


    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    // const {durationMinutes, approved, otp }= req.body;
    const { handshakeId, approved, durationMinutes, scopes } = req.body || {};
    if (!handshakeId)
      return res.status(400).json({ error: "handshakeId is required" });

    var pendingRaw = await getPendingGrant(handshakeId);
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

    const requesterType =
      pending.caregiverRoleAssignment === "caregiver_onboarding"
        ? "caregiver" : pending.requesterType;


    if (!approved) {
      // await redis.del(`pending:${patientId}`);
      // await redis.del(`otp:${otp}`)

      await deletePendingGrant(handshakeId, patientId);
      await logSecurityEvent('access', 'GRANT_ACCESS_DENIED', req, {
        patientId,
        requesterId: pending.requesterId,
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

    const requesterId = pending.requesterId

    // if(pending.caregiverRoleAssignment== "caregiver_onboarding")
    //   requesterType= "caregiver";

    const grant = {
      requesterType,
      grantId,
      patientId,
      requesterId,
      status: "active",
      scopes:
        Array.isArray(scopes) && scopes.length
          ? scopes
          : ["read"],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      ttlSeconds,
      // ,scope:
    };

    await saveGrant(grant);

    await deletePendingGrant(handshakeId, patientId);

    if (pending.caregiverRoleAssignment == "caregiver_onboarding") {
      await addUserToGroup(pending.requesterId, "Caregiver");
      await setCaregiverMappings(requesterId, patientId);
    }

    if (pending.caregiverRoleAssignment == "caregiver_assigned")
      await setCaregiverMappings(requesterId, patientId);

    await logSecurityEvent('access', 'GRANT_ISSUED', req, {
      patientId,
      requesterId: pending.requesterId,
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


// Patient: list all pending grant requests waiting for their approval
router.get('/pending', requireApiAuth, async (req, res) => {
  try {
    const patientId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!patientId) return res.status(401).json({ error: "Unauthorized" });

    const handshakeIds = await listPendingHandshakes(patientId);
    if (!handshakeIds || handshakeIds.length === 0) {
      return res.status(200).json({ pending: [] });
    }

    const pending = [];
    for (const handshakeId of handshakeIds) {
      // const raw = await redis.get(`pending_grant:${handshakeId}`);
      const raw = await getPendingGrant(handshakeId);
      if (raw) {
        pending.push(JSON.parse(raw));
      } else {
        // expired — clean up the set
        // await redis.sRem(`patient_pending:${patientId}`, handshakeId);
        await deletePendingGrant(handshakeId, patientId);
      }
    }

    return res.status(200).json({ pending });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch pending grants", detail: e.message });
  }
});

// Practitioner/Caregiver: poll whether patient approved a specific handshake
router.get('/status/:handshakeId', requireApiAuth, async (req, res) => {
  try {
    const requesterId = req.jwt?.sub || req.kauth?.token?.grant?.sub;
    if (!requesterId) return res.status(401).json({ error: "Unauthorized" });

    const { handshakeId } = req.params;
    // const pendingRaw = await redis.get(`pending_grant:${handshakeId}`);
    const pendingRaw = await getPendingGrant(handshakeId);

    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending.requesterId !== requesterId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ status: "pending", handshakeId });
    }

    // pending_grant is gone — check if an active grant was issued
    const patientId = req.query.patientId;
    if (patientId) {
      const grant = await getGrantByRequesterAndPatient(requesterId, patientId);
      // if (grant) {
        // const grant = JSON.parse(grantRaw);
        if (grant && new Date(grant.expiresAt) > new Date()) {
          return res.status(200).json({ status: "approved", grant });
        // }
      }
    }

    return res.status(200).json({ status: "expired" });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch status", detail: e.message });
  }
});

module.exports = router;
