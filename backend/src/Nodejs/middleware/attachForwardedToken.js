const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

module.exports = async function attachForwardedToken(req, res, next) {
  try {
    const forwarded = req.headers['x-access-token'];


    if (forwarded) {
      const decoded = jwt.decode(forwarded);
      // console.log('attachForwardedToken decoded token:', decoded);
      if (decoded) {
        req.kauth = req.kauth || {};
        req.kauth.token = req.kauth.token || {};
        req.kauth.token.grant = decoded;

        const sid = decoded.sid || null;
        const cookieHeader = req.headers.cookie || '';
        const cookieName = process.env.OAUTH_COOKIE_NAME;
        const sessionCookie = cookieHeader.split(';').map(s => s.trim()).find(c => c.startsWith(cookieName + '='));
        //   if (sid && sessionCookie) {
        //     const sessionVal = sessionCookie.split('=')[1];
        //     await redis.sadd(`kc_sid:${sid}`, sessionVal);
        //     await redis.expire(`kc_sid:${sid}`, 60 * 60 * 24);
        // }
        if (sid && sessionCookie) {
          const sessionVal = sessionCookie.split('=')[1];

          // await redis.sadd(`kc_sid:${sid}`, sessionVal);

          const unsigned = (sessionVal || '').split('|')[0];

          // decode v2 format: v2.<base64(ticketId)>.<base64(secret)>
          let ticketId = null;
          const parts = unsigned.split('.');
          if (parts.length === 3 && parts[0] === 'v2') {
            try {
              ticketId = Buffer.from(parts[1], 'base64').toString('utf8');
            } catch (e) {
             console.error('attachForwardedToken error decoding ticketId from v2 cookie:', e && e.message);
            }
          }

          // fallback 
          if (!ticketId) {
            if (unsigned.startsWith((process.env.OAUTH_COOKIE_NAME ) + '-')) {
              ticketId = unsigned;
            } else if (unsigned.includes('-')) {
              ticketId = `${process.env.OAUTH_COOKIE_NAME }-${unsigned.split('|')[0]}`;
            } else {
              ticketId = unsigned;
            }
          }

         
          if (sid && ticketId) {
            await redis.sadd(`kc_sid:${sid}`, ticketId);
          }

          await redis.expire(`kc_sid:${sid}`, 60 * 30); //30 mins
        }
      }
    }
   //id token
    try {
      const rawId = req.headers['x-id-token'] || null;
      if (rawId) {
        const decodedId = jwt.decode(rawId);
        req.kauth = req.kauth || {};
        req.kauth.token = req.kauth.token || {};
        req.kauth.token.id_token = { raw: rawId, claims: decodedId };
      }
    } catch (e) {
      console.error('attachForwardedToken error decoding id token:', e && e.message);
    }

  } catch (err) {
    console.error('attachForwardedToken error decoding forwarded token:', err && err.message);
  }
  return next();
};
