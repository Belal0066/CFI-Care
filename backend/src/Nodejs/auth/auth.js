const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const app = express();

const JWKS_URI = `${process.env.KC_HOSTNAME}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`;
const ISSUER = `${process.env.KC_HOSTNAME}/realms/${process.env.KEYCLOAK_REALM}`;

const client = jwksClient({
    jwksUri: JWKS_URI,
    cache: true,
    rateLimit: true,
    // jwksRequestsPerMinute: 10,
    // cacheMaxEntries: 5,
    // cacheMaxAge: 600000 // 10 mins
});


function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

app.get('/validate', (req, res) => {
    const autho = req.get('Authorization');
    const token =  autho.startsWith('Bearer ') ? autho.slice(7) : null;
    if (!token) {
        return res.status(401).json({ message: 'Missing token' });
    }
    
    jwt.verify(token, getKey, {
        issuer: ISSUER,
        audience: process.env.EXPECTED_AUDIENCE,
        algorithms: ['RS256'],
        clockTolerance: parseInt(process.env.ALLOWED_CLOCK_SKEW) 
    }, (err, payload) => {
        if (err) {
            console.error('Token verification failed:', err);
            return res.status(401).json({ message: 'Invalid token', error: err.message });
        }
        res.set('X-Authenticated-subject', payload.sub);
        res.set('X-Authenticated-audience', payload.aud);
        res.set('X-Authentiacted-scope', payload.scope || '');
        return res.status(200).json({ message: 'Token is valid', payload: payload });
    });
});

const port = process.env.AUTH_PORT || 3001;
app.listen(port, () => {
    console.log(`Auth service listening on port ${port}`);
});