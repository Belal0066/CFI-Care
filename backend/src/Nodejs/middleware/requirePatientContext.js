
const { logSecurityEvent } = require("../utils/logSecurityEvent");
const { getGrantByRequesterAndPatient } = require("../services/Grant_Storage_Redis");

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
  return new Set(
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
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
  if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE")
    return "write";
  return "unknown";
}

function isGrantActive(grant) {
  if (!grant || grant.status !== "active") return false;
  if (!grant.expiresAt) return false;
  return new Date(grant.expiresAt) > new Date();
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
// if req is cargeiver -> allow =D
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
        return res
          .status(401)
          .json({ error: "Unauthorized: missing token claims" });
      }

      const reqId = claims.sub;
      if (!reqId) {
        return res
          .status(401)
          .json({ error: "Unauthorized: missing subject claim" });
      }

      let patientId = req.params?.[paramName] || req.body?.[paramName] || req.query?.[paramName];
      // Fallback: extract from FHIR patient.reference or subject.reference (e.g. "Patient/some-id")
      if (!patientId) {
        const fhirRef = req.body?.patient?.reference || req.body?.subject?.reference;
        if (fhirRef) {
          const ref = String(fhirRef);
          patientId = ref.includes("/") ? ref.split("/").pop() : ref;
        }
      }
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

      const resourceType = req.baseUrl?.split("/")[2] || "Unknown";
      const action = methodToAction(req.method);

      // Grant-first check: look up any active Redis grant for this (requester, patient) pair.
      // This works for both practitioners and caregivers, and crucially handles caregivers
      // whose Keycloak JWT still shows "patient" role (before token refresh after onboarding).
      const grant = await getGrantByRequesterAndPatient(reqId, patientId);

      if (!grant) {
        await logSecurityEvent("access", "CONSENT_GRANT_NOT_FOUND", req, {
          actorType: "unknown",
          patientId,
          requesterId: reqId,
          reason: "No active grant found for requester",
          action,
          resourceType,
        });
        return res.status(403).json({
          error: "Forbidden: no active consent grant",
        });
      }

      if (!isGrantActive(grant)) {
        await logSecurityEvent("access", "CONSENT_GRANT_INVALID", req, {
          actorType: grant.requesterType || "unknown",
          patientId,
          requesterId: reqId,
          reason: "Grant expired",
          action,
          resourceType,
        });
        return res.status(403).json({
          error: "Forbidden: consent grant is inactive or expired",
        });
      }

      if (!isActionAllowed(grant.scopes, action)) {
        await logSecurityEvent("access", "ACCESS_DENIED", req, {
          actorType: grant.requesterType || "unknown",
          patientId,
          requesterId: reqId,
          reason: `Requester lacks ${action} permission`,
          action,
          resourceType,
        });
        return res.status(403).json({
          error: "Forbidden: grant does not permit this operation",
        });
      }

      req.accessContext = {
        type: `${grant.requesterType || "delegated"}_delegated`,
        reqId,
        patientId,
        grant,
      };

      await logSecurityEvent("access", "ACCESS_ALLOWED", req, {
        actorType: grant.requesterType || "unknown",
        patientId,
        requesterId: reqId,
        resourceType,
        action,
        reason: "Valid grant found, access allowed",
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
