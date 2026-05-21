const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

// const KEYCLOAK_BASE_URL =process.env.KC_HOST_FULL;
const REALM = process.env.KEYCLOAK_REALM;
const ISSUER = process.env.KC_ISSUER || `${process.env.KC_HOST_FULL}/realms/${REALM}`;
const JWKS_URI = process.env.KC_JWKS_URI; //|| `${ISSUER}/protocol/openid-connect/certs`;

const client = jwksRsa({
    jwksUri: JWKS_URI,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000 // 10 minutes


});

const getKey = (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

function normalizeAudiences(aud) {
  return String(aud || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const verifyToken = (expectedAudience) => {

    const audiences = normalizeAudiences(expectedAudience);
    return function (req, res, next) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Missing or invalid Authorization header' });
        }
        const token = authHeader.slice(7);
        jwt.verify(token, getKey, {
            audience: audiences,
            issuer: ISSUER,
            algorithms: ['RS256'],
            clockTolerance: parseInt(process.env.ALLOWED_CLOCK_SKEW) || 30 // in seconds
        }, (err, payload) => {
            if (err) {
                console.error('JWT  verification failed:', err);
                return res.status(401).json({ message: 'Invalid token', error: err.message });
            }
            req.kauth = { token: { grant: payload } };
            next();
        });
    }
}

module.exports = { verifyToken };