const express = require('express');
const crypto = require('crypto');
const Redis = require('ioredis');
const router = express.Router();
const redis = new Redis(); 


router.post('/issue', async (req, res) => {
    const { patientId } = req.session.user?.sub; 

    
    const otp = crypto.randomInt(100000, 999999).toString();
    // 10 mins
    await redis.set(`otp:${otp}`, patientId, 'EX', 600);

    res.status(200).json({ 
        message: "OTP generated successfully", 
        otp: otp,
        expiresIn: "10 min" 
    });
});


router.post('/verify', async (req, res) => {
    // const practitionerId  = req.session.user?.sub;
    const otp = req.body;

    const patientId = await redis.getdel(otpKey);

    if (!patientId) {
        return res.status(404).json({ error: "Invalid or expired OTP" });
    }

    // hancall func yb3t notif hena

    // await redis.set(`pending:${patientId}`, practitionerId, 'EX', 120);

    res.status(200).json({ 
        message: "Code verified. waiting for patient approval...",
        targetPatientId: patientId 
    });
});



// after patient approval
router.post('/approve', async (req, res) => {
    const patientId = req.session.user?.sub;
    const {durationMinutes, approved, otp }= req.body;

    if (!approved) {
        // await redis.del(`pending:${patientId}`);
        // await redis.del(`otp:${otp}`)
        return res.status(200).json({ message: "Access denied by user" });
    }

    // create grant
    const grantId = crypto.randomUUID();
    const ttlSeconds = durationMinutes * 60;
    
    const grantData = {
        grantId,
        patientId,
        browserUserId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
        // ,scope:
    };

    // store access grant in redis (Capability Token)
    await redis.set(`grant:${browserUserId}:${patientId}`, JSON.stringify(grantData), 'EX', ttlSeconds);

    // delete otp
    // await redis.del(`otp:${otp}`)
    
    res.status(201).json({ 
        message: "Access granted", 
        grant: grantData 
    });
});