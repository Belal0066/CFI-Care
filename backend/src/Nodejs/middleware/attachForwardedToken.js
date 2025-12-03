const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

module.exports = async function attachForwardedToken(req, res, next) {
  try {
    const forwarded = req.headers['x-access-token'] ;


    if (forwarded) {
      const decoded = jwt.decode(forwarded);
      console.log('attachForwardedToken decoded token:', decoded);
      if (decoded) {
        req.kauth = req.kauth || {};
        req.kauth.token = req.kauth.token || {};
        req.kauth.token.grant = decoded;

        const sid = decoded.sid || null;
        const cookieHeader = req.headers.cookie || '';
        const cookieName = process.env.OAUTH_COOKIE_NAME;
        const sessionCookie = cookieHeader.split(';').map(s=>s.trim()).find(c => c.startsWith(cookieName + '='));
        if (sid && sessionCookie) {
          const sessionVal = sessionCookie.split('=')[1];
          await redis.sadd(`kc_sid:${sid}`, sessionVal);
          await redis.expire(`kc_sid:${sid}`, 60 * 60 * 24);
      }
    }
  } 
  }catch (err) {
    console.error('attachForwardedToken error decoding forwarded token:', err && err.message);
  }
  return next();
};
