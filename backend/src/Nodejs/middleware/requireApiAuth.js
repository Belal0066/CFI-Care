
const { requireBearerJwt } = require("./requireBearerJWT");

function requireApiAuth(req, res, next) {
  const auth = req.headers.authorization || "";

  console.log("[requireApiAuth]", {
    url: req.originalUrl,
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    startsWithBearer: auth.startsWith("Bearer "),
  });

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  return requireBearerJwt(req, res, next);
  // if (auth.startsWith("Bearer ")) {
  //   return requireBearerJwt(req, res, next);
  // }
}

module.exports = { requireApiAuth };