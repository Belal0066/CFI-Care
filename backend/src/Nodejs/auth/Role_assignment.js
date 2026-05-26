const axios = require("axios");
const redis = require("../utils/redisOTPCli");


const {countCaregiverMappings} = require("../services/Grant_Storage_Redis");


// for role group setting - mostly caregiver i made initial roles setting through SPI
const keycloakBaseUrl = process.env.KC_HOST_FULL;
const keycloakRealm = process.env.KEYCLOAK_REALM;
const ClientId = process.env.NOT_IMPORTANT;
const ClientSec = process.env.NOT_AN_IMPORTANT_VAR;


// for token debugging
function decodeJwtNoVerify(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}


function groupNameFromResourceType(resourceType) {
  if (resourceType === "Practitioner") return "Practitioner";
  if (resourceType === "Patient") return "Patient";
  if (resourceType === "Caregiver") return "Caregiver";
  return null;
}

async function getKeycloakAdminToken() {
  const tokenUrl = `${keycloakBaseUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ClientId,
    client_secret: ClientSec,
  }).toString();

  try {
    const { data } = await axios.post(tokenUrl, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true,
    });


    if (data?.access_token) {
      const claims = decodeJwtNoVerify(data.access_token);
      console.error("[ROLE_ASSIGN] token claims", {
        tokenUrl,
        azp: claims?.azp,
        aud: claims?.aud,
        realm_access: claims?.realm_access|| [],
        resource_acceess:claims?.resource_access||[]
      });
    return data.access_token;

    }

    console.error("[ROLE_ASSIGN] token fetch non-success payload", { tokenUrl, data });
    throw new Error("Unable to obtain access token");
  } catch (e) {
    console.error("[ROLE_ASSIGN] token fetch failed", {
      url: tokenUrl,
      status: e.response?.status,
      headers: e.response?.headers,
      data: e.response?.data,
      message: e.message,
    });
    throw e;
  }
}

async function getGroupIdByName(accessToken, groupName) {
  const groupsUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/groups`;

  try {
    const response = await axios.get(groupsUrl, {
      params: { search: groupName },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    });

    console.error("[ROLE_ASSIGN] group lookup response", {
      url: groupsUrl,
      status: response.status,
      location: response.headers?.location,
      wwwAuthenticate: response.headers?.["www-authenticate"],
      data: response.data,
    });

    if (response.status !== 200) {
      throw new Error(`Group lookup failed with status ${response.status}`);
    }

    const groups = Array.isArray(response.data) ? response.data : [];
    const exact = groups.find(
      (g) => g.name === groupName || g.path === `/${groupName}`
    );

    return exact ? exact.id : null;
  } catch (e) {
    console.error("[ROLE_ASSIGN] group lookup failed", {
      url: groupsUrl,
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    throw e;
  }
}

async function removeUserFromGroup(userId, groupName) {
  
  const accessToken = await getKeycloakAdminToken();
  const groupId = await getGroupIdByName(accessToken, groupName);

  if (!groupId) throw new Error(`Keycloak group not found: ${groupName}`);

  const membershipUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/users/${userId}/groups/${groupId}`;
  const resp = await axios.delete(membershipUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    validateStatus: () => true,
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`remove user from group failed ( ${resp.status} )`);
  }
}

async function addUserToGroup(userId, groupName) {
  
  const accessToken = await getKeycloakAdminToken();
  const groupId = await getGroupIdByName(accessToken, groupName);

  if (!groupId) throw new Error(`Keycloak group not found: ${groupName}`);

  const membershipUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/users/${userId}/groups/${groupId}`;
  const resp =await axios.put(membershipUrl, null, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    validateStatus: () => true,
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`Add user to group failed with status ${resp.status}`);
  }
}


async function assignKeycloakGroupByResourceType(userId, resourceType) {
  const groupName = groupNameFromResourceType(resourceType);
  if (!groupName) return;
  await addUserToGroup(userId, groupName);
}

async function revokeCaregiverGroupIfNoActivePatients(caregiverId) {
  const remaining = await countCaregiverMappings(caregiverId);
  if (remaining === 0) {countCaregiverMappings
    await removeUserFromGroup(caregiverId, "Caregiver");
    // return true;
  }
  return remaining;
}

module.exports = {
  assignKeycloakGroupByResourceType,
  addUserToGroup,
  removeUserFromGroup,
  revokeCaregiverGroupIfNoActivePatients,
};