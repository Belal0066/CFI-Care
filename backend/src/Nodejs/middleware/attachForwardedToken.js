const jwt = require('jsonwebtoken');

module.exports = function attachForwardedToken(req, res, next) {
  try {
    const forwarded = req.headers['x-access-token'] ;


    if (forwarded) {
      const decoded = jwt.decode(forwarded);
      console.log('attachForwardedToken decoded token:', decoded);
      if (decoded) {
        req.kauth = req.kauth || {};
        req.kauth.token = req.kauth.token || {};
        req.kauth.token.grant = decoded;
      }
    }
  } catch (err) {
    console.error('attachForwardedToken error decoding forwarded token:', err && err.message);
  }
  return next();
};
