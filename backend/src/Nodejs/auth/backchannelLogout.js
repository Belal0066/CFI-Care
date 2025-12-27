
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const Redis = require('ioredis');

const router = express.Router();
const redis = new Redis(process.env.REDIS_URL );

redis.on('error', (err) => {
  console.error('[ioredis] error connecting to redis:', err && err.message);
});
redis.on('connect', () => {
  console.log('[ioredis] connected to redis');
});

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ID_SYSTEM || process.env.KC_HOSTNAME + '/realms/' + process.env.KEYCLOAK_REALM;
const JWKS_URI = `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`;
const BACKCHANNEL_AUDIENCE = process.env.BACKCHANNEL_AUDIENCE ;

const client = jwksClient({ jwksUri: JWKS_URI, timeout: 30000 });
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

router.post('/backchannel_logout', express.urlencoded({ extended: false }), express.json(), async (req, res) => {
  const logoutToken = (req.body && (req.body.logout_token || req.body.logoutToken)) || null;
  if (!logoutToken) return res.status(400).send('missing logout_token');

  try {
    const payload = await new Promise((resolve, reject) =>
      jwt.verify(logoutToken, getKey, { issuer: KEYCLOAK_ISSUER, audience: BACKCHANNEL_AUDIENCE, algorithms: ['RS256'] }, (err, p) => err ? reject(err) : resolve(p))
    );

      //replay prev?
      if (payload.jti) {
      const seenKey = `jti_seen:${payload.jti}`;
      const added = await redis.setnx(seenKey, '1');
      if (added === 0) {
        console.warn('replayed logout_token jti', payload.jti);
        return res.status(200).send('OK');
      }
      await redis.expire(seenKey, 300); 
    }

    if (!payload.events || !payload.events['http://schemas.openid.net/event/backchannel-logout']) {
      console.warn('not a backchannel event', payload.events);
      return res.status(400).send('not backchannel logout');
    }

    const sid = payload.sid;
    const sub = payload.sub;
    if (!sid && !sub) return res.status(400).send('no sid/sub');

    if (sid) {
      
      const sessionVals = await redis.smembers(`kc_sid:${sid}`);
      for (const val of sessionVals) {
        try {
         
          if (await redis.exists(val)) {
            console.log('deleting exact redis key', val);
            await redis.del(val);
            continue;
          }


          const keyPattern = `*${val}*`;
          console.log('scanning redis for pattern (fallback)', keyPattern);
          const stream = redis.scanStream({ match: keyPattern, count: 100 });
          let any = false;
          for await (const keys of stream) {
            if (keys.length) {
              any = true;
              console.log('deleting redis keys:', keys);
              await redis.del(...keys);
            }
          }
          if (!any) console.log('no redis keys matched pattern for value', val);
        } catch (err) {
          console.error('error while deleting session keys for', val, err && err.message);
        }
      }
      await redis.del(`kc_sid:${sid}`);
    }

    console.log('backchannel logout processed', { sid, sub });
    return res.status(200).send('OK');
  } catch (err) {
    console.error('invalid logout_token', err && err.message);
    return res.status(400).send('invalid logout_token');
  }
});

module.exports = router;

// for testing 
router.get('/backchannel_logout', (req, res) => {
  res.set('Content-Type', 'text/plain');
  return res.status(200).send('backchannel endpoint reachable');
});