// const Redis = require("ioredis");
// const redis = new Redis(process.env.REDIS_URL);

const { logSecurityEvent } = require('../utils/logSecurityEvent');

function getClaims(req) {
  if (req.jwt && typeof req.jwt === "object") return req.jwt;
  if (req.kauth?.token?.grant && typeof req.kauth.token.grant === "object") {
    return req.kauth.token.grant;
  }
  return null;
}

function collectRoles(claims) {
  const roles = new Set();
  for (const r of claims?.realm_access?.roles || []) roles.add(r);
  const ra = claims?.resource_access || {};
  for (const client of Object.values(ra)) {
    for (const r of client?.roles || []) roles.add(r);
  }
  return roles;
}

function parseCsvSet(v, fallback = []) {
  if (!v || typeof v !== "string") return new Set(fallback);
  return new Set(v.split(",").map(x => x.trim()).filter(Boolean));
}

function hasAnyRole(roles, allowed) {
  for (const role of roles) {
    if (allowed.has(role)) return true;
  }
  return false;
}

function methodToAction(method) {
  const m = String(method || "").toUpperCase();
  if (m === "GET" || m === "HEAD") return "read";
  if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") return "write";
  return "unknown";
}

function isGrantActive(grant) {
  if (!grant || grant.status !== "active") return false;
  if (!grant.expiresAt) return false;
  return new Date(grant.expiresAt) < new Date();
}

function isActionAllowed(permissions, action) {
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes("*")) return true;
  if (permissions.includes("full_access")) return true;
  if (action === "read") return permissions.includes("read");
  if (action === "write") return permissions.includes("write");
  return false;
}


// if req is the patient -> allow :D
// if req is admin -> allow :)
// if req is dr with active grant -> allow, attach grant to req
// else denied

function requirePatientContext(options = {}) {
  const paramName = options.paramName || "patientId";
  const adminRoles = parseCsvSet(process.env.OWNERSHIP_BYPASS_ROLES);
  const practitionerRoles = parseCsvSet(process.env.PRACTITIONER_ROLES);
  const caregiverRoles = parseCsvSet(process.env.CAREGIVER_ROLES);

  return async function (req, res, next) {
    try {
      const claims = getClaims(req);
      if (!claims) {
        return res.status(401).json({ error: "Unauthorized: missing token claims" });
      }

      const reqId = claims.sub;
      if (!reqId) {
        return res.status(401).json({ error: "Unauthorized: missing subject claim" });
      }

      const patientId = req.params?.[paramName];
      if (!patientId) {
        return res.status(400).json({
          error: `Bad request: missing route parameter '${paramName}'`,
        });
      }

      const roles = collectRoles(claims);


      // for (const role of roles) {
        if (hasAnyRole(roles, adminRoles)) {
        req.accessContext = { type: "admin", reqId, patientId };
        return next();
      }
      // }

      if (reqId === patientId) {
        req.accessContext = { type: "patient", reqId, patientId };
        return next();
      }

      // caregiver

      const isCaregiver = hasAnyRole(roles, caregiverRoles);
      if (isCaregiver) {
        

        // FHIR
        // relationRaw = database query using id

        if (!relationRaw) {
          await logSecurityEvent("access", "ACCESS_DENIED", req, {
            actorType: "caregiver",
            patientId,
            caregiverId: reqId,
            reason: "No active caregiver relationship",
            resourceType,
          });
          return res.status(403).json({
            error: "Forbidden: no active caregiver relationship",
          });
        }

        const relation = JSON.parse(relationRaw);
        const action = methodToAction(req.method);

        if (!isActionAllowed(relation.permissions, action)) {
          await logSecurityEvent("access", "ACCESS_DENIED", req, {
            actorType: "caregiver",
            patientId,
            caregiverId: reqId,
            reason: `Caregiver lacks ${action} permission`,
            relationshipId: relation.relationshipId,
            resourceType,
          });
          return res.status(403).json({
            error: "Forbidden: caregiver permission denied for this operation",
          });
        }

        req.accessContext = {
          type: "caregiver_delegated",
          reqId,
          patientId,
          relationship: relation,
        };

        await logSecurityEvent("access", "ACCESS_ALLOWED", req, {
          actorType: "caregiver",
          patientId,
          caregiverId: reqId,
          relationshipId: relation.relationshipId,
          action,
          resourceType,
          reason: "Valid caregiver permission",
        });

        return next();
      }


      const isPractitioner = hasAnyRole(roles, practitionerRoles);
      if (!isPractitioner) {
        await logSecurityEvent("access", "ACCESS_DENIED", req, {
          actorType: "unknown",
          patientId,
          requesterId: reqId,
          reason: "Not admin, patient owner, caregiver, or practitioner",
          resourceType,
        });
        return res.status(403).json({
          error: "Forbidden: not admin, not patient owner, not caregiver, not practitioner",
        });
      }

      const grantKey = `grant:${reqId}:${patientId}`;
      const grantRaw = await redis.get(grantKey);
      if (!grantRaw) {
        await logSecurityEvent('access', 'CONSENT_GRANT_NOT_FOUND', req, {
                    actorType: "practitioner",
                    patientId,
                    practitionerId: reqId,
                    reason: "No valid grant found",
                    resourceType,
                  });
        return res.status(403).json({
          error: "Forbidden: no active patient consent grant",
        });
      }

      const grant = JSON.parse(grantRaw);
      if (grant.status !== "active" || new Date(grant.expiresAt) < new Date()) {
        await logSecurityEvent('access', 'CONSENT_GRANT_INVALID', req, {
                        actorType: "practitioner",
                        patientId,
                        practitionerId: reqId,
                        grantId: grant?.grantId,
                        reason: "Grant expired",
                        resourceType,
                      });
        return res.status(403).json({
          error: "Forbidden: patient consent grant is inactive",
        });
      }

      req.accessContext = {
        type: "practitioner_delegated",
        reqId,
        patientId,
        grant,
      };

      await logSecurityEvent('access', 'CONSENT_GRANT_VALID', req, {
                        actorType: "practitioner",
                        patientId,
                        practitionerId: reqId,
                        grantId: grant.grantId,
                        resourceType: req.baseUrl?.split('/')[2] || 'Unknown',
                        reason: 'Valid grant found, access allowed'
                    });
      return next();
    } catch (err) {
      return res.status(500).json({
        error: "Patient context validation failed",
        detail: err.message,
      });
    }
  };
}

module.exports = { requirePatientContext };