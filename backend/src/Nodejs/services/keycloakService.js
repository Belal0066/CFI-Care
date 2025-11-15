const axios = require('axios');

const KEYCLOAK_TOKEN_URL = `${process.env.KC_HOSTNAME}/protocol/openid-connect/token`;
const INTROSPECT_URL = `${process.env.KC_HOSTNAME}/protocol/openid-connect/token/introspect`;
const client_id = process.env.KC_CLIENT_ID;
const client_secret = process.env.KC_CLIENT_SECRET;

async function exchangeToken(code , code_verifier , redirect_uri) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id : client_id,
        code : code,
        redirect_uri : redirect_uri,
        code_verifier : code_verifier
    }).toString();

    return (await axios.post(KEYCLOAK_TOKEN_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })).data;
}

async function refreshToken(refresh_token) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: client_id,
        refresh_token: refresh_token,

    }).toString();

    return (await axios.post(KEYCLOAK_TOKEN_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })).data;
}


async function introspectToken(token) {

    const body = new URLSearchParams({
        token: token,
        client_id: client_id,
        client_secret: client_secret
    }).toString();

    return (await axios.post(INTROSPECT_URL, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })).data;
}



// tok exchange law neghyr token ma5sos l fhir

// async function exchangeToken(Token , audience) {
//     const body = new URLSearchParams({
//         grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
//         client_id: client_id,
//         subject_token: Token,
//         subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
//         audience: audience
//     }).toString();

//     return (await axios.post(KEYCLOAK_TOKEN_URL, body, {
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//     })).data;
    
// }

module.exports = {
    exchangeToken,
    refreshToken,
    introspectToken
};