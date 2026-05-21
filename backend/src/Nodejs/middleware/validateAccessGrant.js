const validateGrant = async (req, res, next) => {
    const { practitionerId, patientId } = req.headers;

    const grantRaw = await redis.get(`grant:${practitionerId}:${patientId}`);

    if (!grantRaw) {
        return res.status(403).json({ error: "No active access grant found for this user" });
    }

    req.currentGrant = JSON.parse(grantRaw);
    next();
};

