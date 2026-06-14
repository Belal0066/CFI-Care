const express = require('express');
const { requireApiAuth } = require('../middleware/requireApiAuth');
const { logSecurityEvent } = require('../utils/logSecurityEvent');

const router = express.Router();

function parseList(v) {
  return String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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

function hasAnyRole(roles, allowedList) {
  const allowed = new Set(allowedList);
  for (const role of roles) {
    if (allowed.has(role)) return true;
  }
  return false;
}

function resolveRequesterType(claims) {
  const roles = collectRoles(claims);
  const caregiverRoles = parseList(process.env.CAREGIVER_ROLES);
  const practitionerRoles = parseList(process.env.PRACTITIONER_ROLES);
  const patientRoles = parseList(process.env.PATIENT_ROLES);

  if (hasAnyRole(roles, caregiverRoles)) {
    return "caregiver";
  }

  if (hasAnyRole(roles, practitionerRoles)) {
    return "practitioner";
  }

  if(hasAnyRole(roles,patientRoles)){
    return "patient";
  }

  return "unknown";
}

module.exports = {
  resolveRequesterType,
};