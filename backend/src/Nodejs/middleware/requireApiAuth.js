const { requireSession } = require("./requireSession");
const { requireBearerJwt } = require("./requireBearerJWT");

function requireApiAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  
  console.log("[requireApiAuth]", {
  url: req.originalUrl,
  method: req.method,
  hasAuthHeader: !!req.headers.authorization,
  startsWithBearer: auth.startsWith("Bearer "),
});
  if (auth.startsWith("Bearer ")) {
    return requireBearerJwt(req, res, next);
  }
  return requireSession(req, res, next);
}

module.exports = { requireApiAuth };