const axios = require("axios");

// for role group setting - mostly caregiver i made initial roles setting through SPI
const keycloakBaseUrl = process.env.KC_HOSTNAME_INTERNAL;
const keycloakRealm = process.env.KEYCLOAK_REALM;
const keycloakAdminClientId = process.env.KC_CLIENT_ID;
const keycloakAdminClientSecret = process.env.KC_CLIENT_SECRET;


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
    client_id: keycloakAdminClientId,
    client_secret: keycloakAdminClientSecret,
  }).toString();

  const { data } = await axios.post(tokenUrl, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return data.access_token;
}

async function getGroupIdByName(accessToken, groupName) {
  const groupsUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/groups?search=${encodeURIComponent(groupName)}`;
  const { data } = await axios.get(groupsUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const groups = Array.isArray(data) ? data : [];
  const exactMatch = groups.find(
    (group) => group.name === groupName || group.path === `/${groupName}`,
  );

  return exactMatch ? exactMatch.id : null;
}

async function addUserToGroup(userId, groupName) {
  const accessToken = await getKeycloakAdminToken();
  const groupId = await getGroupIdByName(accessToken, groupName);

  if (!groupId) {
    throw new Error(`Keycloak group not found: ${groupName}`);
  }

  const membershipUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/users/${userId}/groups/${groupId}`;
  await axios.put(membershipUrl, null, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

async function removeUserFromGroup(userId, groupName) {
  const accessToken = await getKeycloakAdminToken();
  const groupId = await getGroupIdByName(accessToken, groupName);

  if (!groupId) {
    throw new Error(`Keycloak group not found: ${groupName}`);
  }

  const membershipUrl = `${keycloakBaseUrl}/admin/realms/${keycloakRealm}/users/${userId}/groups/${groupId}`;
  await axios.delete(membershipUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}


// async function assignKeycloakGroupByResourceType(userId, resourceType) {
//   const groupName = groupNameFromResourceType(resourceType);
//   if (!groupName) return;
//   await addUserToGroup(userId, groupName);
// }

module.exports = { addUserToGroup, removeUserFromGroup};