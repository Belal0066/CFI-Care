module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};