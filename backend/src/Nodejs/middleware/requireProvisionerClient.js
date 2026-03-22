function requireProvisionerClient(req, res, next) {
  const claims = req.jwt || {};
  const callerClient = claims.azp || claims.client_id;
  const expected = process.env.KC_PROVISIONER_CLIENT_ID;

  console.log("[PROVISIONER-CHECK]", {
    callerClient,
    expected,
    allClaims: Object.keys(claims)
  });

  if (!expected) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  if (callerClient !== expected) {
    console.log("[PROVISIONER-CHECK] MISMATCH:", callerClient, "!==", expected);
    return res.status(403).json({ error: "Forbidden caller" });
  }

  console.log("[PROVISIONER-CHECK] PASS");
  return next();
}

module.exports = { requireProvisionerClient };