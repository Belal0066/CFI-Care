const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const kcHost = process.env.KC_HOSTNAME;
const realm = process.env.KEYCLOAK_REALM;
const issuer = process.env.KC_ISSUER || `${kcHost}/realms/${realm}`;
const jwksUri = process.env.KC_JWKS_URI || `${issuer}/protocol/openid-connect/certs`;

// const expectedAudience = process.env.EXPECTED_AUDIENCE || process.env.KC_CLIENT_ID;
const allowedAudiences = (process.env.EXPECTED_AUDIENCE || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const allowedClockSkew = parseInt(process.env.ALLOWED_CLOCK_SKEW || "120", 10);

const client = jwksClient({
  jwksUri,
  cache: true,
  rateLimit: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function requireBearerJwt(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  jwt.verify(
    token,
    getKey,
    {
      issuer,
      audience: allowedAudiences,
      algorithms: ["RS256"],
      clockTolerance: allowedClockSkew,
    },
    (err, payload) => {
      if (err) return res.status(401).json({ error: "Invalid token", detail: err.message });
      req.jwt = payload;
      req.user = { sub: payload.sub, email: payload.email };
      req.accessToken = token;
      return next();
    },
  );
}

module.exports = { requireBearerJwt };