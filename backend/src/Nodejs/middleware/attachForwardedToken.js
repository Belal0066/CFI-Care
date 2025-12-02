const jwt = require('jsonwebtoken');

module.exports = function attachForwardedToken(req, res, next) {
  try {
    const forwarded = req.headers['x-auth-request-access-token'] || req.headers['x-access-token'] ||
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (forwarded) {
      const decoded = jwt.decode(forwarded);
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
