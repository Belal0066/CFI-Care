const express = require("express");
const router = express.Router();
const axios = require("axios");
// const {
//   loginLimiter,
//   registerLimiter,
//   logoutAllLimiter,
// } = require("../middleware/rateLimiter");
// const {
//   validateLogin,
//   validateRegister,
// } = require("../middleware/validateInput");
const { logAuthEvent } = require("../utils/auditLog");
const {
  addSessionForUser,
  removeSessionForUser,
  getSessionsForUser,
  clearAllSessionsForUser,
  destroySessionById,
} = require("../utils/userSessions");


const { requireApiAuth } = require("../middleware/requireApiAuth");


const regProvisioningRoutes = require("./regProvisioningRoute");

router.use("/provisioning", regProvisioningRoutes);

const kcHost = process.env.KC_HOST_FULL;
const internal = process.env.KC_HOSTNAME_INTERNAL;
const realm = process.env.KEYCLOAK_REALM;
const clientId = process.env.KC_CLIENT_ID;
const clientSecret = process.env.KC_CLIENT_SECRET;
const redirectUri = `${process.env.BACKEND_HOSTNAME}/auth/callback`;
const scopes = process.env.KC_SCOPES || "openid profile email patient/*.rs";



router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.session.oauth_state) {
    return res.status(400).send('Invalid state or code');
  }
  const tokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: req.session.code_verifier,
  }).toString();

  try {
    const { data: tokens } = await axios.post(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    // might remove later :/
    const { data: userinfo } = await axios.get(
      `${kcHost}/realms/${realm}/protocol/openid-connect/userinfo`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    req.session.tokens = {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      id: tokens.id_token,
      exp: Date.now() + tokens.expires_in * 1000,
      refresh_exp: Date.now() + tokens.refresh_expires_in * 1000,
    };
    req.session.user = { sub: userinfo.sub, email: userinfo.email, name: userinfo.name };
    req.session.save(() => {
      res.redirect(process.env.FRONTEND_HOST || '/');
    });
  } catch (e) {
    console.error('token exchange failed', e?.response?.data || e.message);
    res.status(401).send('auth failed :<');
  }
});

router.get('/me', requireApiAuth, (req, res) => {

 const userId = req.user?.sub;
  const email = req.user?.email;

  if (!userId) return res.status(401).json({ authenticated: false });

  if (!req.session?.user) {
    req.session.user = { sub: userId, email };
    req.session.save(() => {});
  }

  return res.json({ authenticated: true, user: { sub: userId, email } });

});


// extr headers set by oauth2 and create backend session for global logout :D
router.get('/session-init', requireApiAuth, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const email = req.user?.email;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    if (req.session?.initializedForUser === userId) {
      return res.json({ success: true, user: req.session.user, reused: true });
    }

    req.session.user = { sub: userId, email };
    req.session.initializedForUser = userId; 

    await addSessionForUser(userId, req.sessionID);
    await logAuthEvent('SESSION_CREATED', req, { userId, email });

    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      return res.json({ success: true, user: req.session.user, reused: false });
    });
  } catch (e) {
    return res.status(500).json({ error: 'Session error' });
  }
});


async function revokeTokens(refreshToken, accessToken) {
  if (!refreshToken) return;

  const kcHost = process.env.KC_HOST_FULL;
  const realm = process.env.KEYCLOAK_REALM;
  const revokeUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/revoke`;

  const body = new URLSearchParams({
    token: refreshToken,
    token_type_hint: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  try {
    await axios.post(revokeUrl, body, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
  } catch (err) {
    console.error('Token revocation error:', err.response?.data || err.message);
  }
}

router.get('/logout', async (req, res) => {
  try {

    const kcHost = process.env.KC_HOST_FULL;
    const realm = process.env.KEYCLOAK_REALM;

    const userId = req.session.user?.sub;

    const email = req.session?.user?.email;

    const rawAuthz = req.headers["x-auth-request-id-token"] || "";
    const idTokenHint = String(rawAuthz).startsWith("Bearer ") ? String(rawAuthz).slice(7) : null;


    if (userId) {
      await removeSessionForUser(userId, req.sessionID);
    }

    req.session.destroy(async () => {
      await logAuthEvent('LOGOUT', req, { userId, email });
      // return res.json({ ok: true });
    });

    const frontendStart = `${process.env.FRONTEND_HOST}/oauth2/start?rd=%2Fdashboard`;

    let kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout` + `?post_logout_redirect_uri=${encodeURIComponent(frontendStart)}` +
      `&client_id=${encodeURIComponent(process.env.CLIENT_ID || 'oauth2-proxy')}`;

    if (idTokenHint) {
      kcLogout += `&id_token_hint=${encodeURIComponent(idTokenHint)}`;
    }

    const fullLogoutURL = `${process.env.OAUTH2_PROXY_SIGNOUT_URL || 'https://localhost/oauth2/sign_out'}` + `?rd=${encodeURIComponent(kcLogout)}`;

    return res.redirect(302, fullLogoutURL);


  } catch (e) {
    console.error('logout redirect error:', e?.message || e);
    return res.redirect('/oauth2/start?rd=%2Fdashboard');
  }
});

router.post('/logout-all', async (req, res) => {
  try {
    const userId = req.session.user?.sub;
    const email = req.session.user?.email;
    const refreshToken = req.session.tokens?.refresh;
    const accessToken = req.session.tokens?.access;

    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (refreshToken && accessToken) {
      await revokeTokens(refreshToken, accessToken);
    }

    // admin logout for all user's sessions
    const adminTokenUrl = `${internal}/realms/${realm}/protocol/openid-connect/token`;
    const adminBody = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    }).toString();

    const { data: adminTokens } = await axios.post(adminTokenUrl, adminBody, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const logoutAllUrl = `${internal}/admin/realms/${realm}/users/${userId}/logout`;
    await axios.post(logoutAllUrl, {}, {
      headers: {
        Authorization: `Bearer ${adminTokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    // destroy all backend sessions for this user
    const sessionIds = await getSessionsForUser(userId);
    for (const sid of sessionIds) {
      await destroySessionById(sid);
    }
    await clearAllSessionsForUser(userId);

    req.session.destroy(() => { });

    await logAuthEvent('LOGOUT_ALL', req, { userId, email });

    return res.json({ ok: true, message: 'Logged out from all devices' });
  } catch (e) {
    console.error('global logout error', e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;


// deprecated grant flow 

//  to implement : rate limiting


// // /auth/register - create user vai Keycloak API
// router.post('/register', registerLimiter, validateRegister, async (req, res) => {
//   const { email, password, fullName } = req.body;

//   if (!email || !password || !fullName) {
//     return res.status(400).json({ error: 'Email, password, and full name required' });
//   }

//   try {
//     // access token using client credentials
//     const adminTokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
//     const adminBody = new URLSearchParams({
//       grant_type: 'client_credentials',
//       client_id: clientId,
//       client_secret: clientSecret
//     }).toString();

//     const { data: adminTokens } = await axios.post(adminTokenUrl, adminBody, {
//       headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//     });

//     // create user
//     const [firstName, ...lastNameParts] = fullName.trim().split(' ');
//     const lastName = lastNameParts.join(' ') || firstName;

//     const createUserUrl = `${kcHost}/admin/realms/${realm}/users`;
//     const userData = {
//       username: email,
//       email: email,
//       firstName: firstName,
//       lastName: lastName,
//       enabled: true,
//       emailVerified: false,
//       credentials: [{
//         type: 'password',
//         value: password,
//         temporary: false
//       }]
//     };

//     await axios.post(createUserUrl, userData, {
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${adminTokens.access_token}`
//       }
//     });

//     // auto-login after registration
//     // and error handling? or probably just a mistake on my end :/
//     //  but i added this anyways:
//     // if Direct Access Grants are disabled in KC return 201 with a prompt to log in manually instead of failing registration.
//     try {
//       const loginTokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
//       const loginBody = new URLSearchParams({
//         grant_type: 'password',
//         client_id: clientId,
//         client_secret: clientSecret,
//         username: email,
//         password: password,
//         scope: scopes
//       }).toString();

//       const { data: tokens } = await axios.post(loginTokenUrl, loginBody, {
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//       });

//       const { data: userinfo } = await axios.get(
//         `${kcHost}/realms/${realm}/protocol/openid-connect/userinfo`,
//         { headers: { Authorization: `Bearer ${tokens.access_token}` } }
//       );

//       // Create FHIR Practitioner
//       try {
//         const practitionerResource = {
//           resourceType: "Practitioner",
//           id: userinfo.sub, // Use Keycloak ID as FHIR ID
//           active: true,
//           name: [
//             {
//               use: "official",
//               family: lastName,
//               given: [firstName],
//               text: fullName,
//             },
//           ],
//           telecom: [
//             {
//               system: "email",
//               value: email,
//               use: "work",
//             },
//           ],
//         };

//         await practitionerService.createPractitionerWithSpecificId(
//           practitionerResource,
//         );
//         console.log(
//           `[REGISTER] Created FHIR Practitioner for ${userinfo.sub}`,
//         );
//       } catch (fhirErr) {
//         console.error("[REGISTER] FHIR Creation Failed:", fhirErr.message);
//         // Log error but continue session creation so user is not blocked
//       }

//       req.session.tokens = {
//         access: tokens.access_token,
//         refresh: tokens.refresh_token,
//         id: tokens.id_token,
//         exp: Date.now() + tokens.expires_in * 1000,
//         refresh_exp: Date.now() + tokens.refresh_expires_in * 1000,
//       };
//       req.session.user = { sub: userinfo.sub, email: userinfo.email, name: userinfo.name };

//       await addSessionForUser(userinfo.sub, req.sessionID);

//       await logAuthEvent('REGISTER', req, {
//         userId: userinfo.sub,
//         email: userinfo.email,
//         autoLogin: true
//       });

//       return req.session.save(() => {
//         res.status(201).json({
//           success: true,
//           autoLogin: true,
//           user: req.session.user
//         });
//       });
//     } catch (autoLoginErr) {
//       const errData = autoLoginErr?.response?.data || {};
//       // const isUnauthorizedClient = errData.error === 'unauthorized_client';
//       const message = 'User created. You can login now.';

//       console.warn('Auto-login after registration skipped:', errData || autoLoginErr.message);

//       // log registration without auto-login
//       await logAuthEvent('REGISTER', req, {
//         email,
//         autoLogin: false,
//         reason: errData.error || autoLoginErr.message
//       });

//       return res.status(201).json({
//         success: true,
//         autoLogin: false,
//         message,
//         reason: errData.error_description || errData.error || autoLoginErr.message
//       });
//     }
//   } catch (e) {
//     console.error('Registration failed:', e?.response?.data || e.message);
//     if (e?.response?.status === 409) {
//       return res.status(409).json({ error: 'User already exists' });
//     }
//     const errorMsg = e?.response?.data?.errorMessage || 'Registration failed';
//     res.status(400).json({ error: errorMsg });
//   }
// });


// // /auth/login -> keycloak token endpoint (Direct Access Grants) --> resource owner pass creds?
// router.post("/login", loginLimiter, validateLogin, async (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({ error: "Email and password required" });
//   }

//   const tokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
//   const body = new URLSearchParams({
//     grant_type: "password",
//     client_id: clientId,
//     client_secret: clientSecret,
//     username: email,
//     password: password,
//     scope: scopes,
//   }).toString();

//   try {
//     const { data: tokens } = await axios.post(tokenUrl, body, {
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     });

//     const { data: userinfo } = await axios.get(
//       `${kcHost}/realms/${realm}/protocol/openid-connect/userinfo`,
//       { headers: { Authorization: `Bearer ${tokens.access_token}` } },
//     );

//     // store in session
//     req.session.tokens = {
//       access: tokens.access_token,
//       refresh: tokens.refresh_token,
//       id: tokens.id_token,
//       exp: Date.now() + tokens.expires_in * 1000,
//       refresh_exp: Date.now() + tokens.refresh_expires_in * 1000,
//     };
//     req.session.user = {
//       sub: userinfo.sub,
//       email: userinfo.email,
//       name: userinfo.name,
//     };

//     await addSessionForUser(userinfo.sub, req.sessionID);
//     console.log(
//       `[LOGIN] Added session ${req.sessionID} for user ${userinfo.sub}`,
//     );

//     // log successful login
//     await logAuthEvent("LOGIN_SUCCESS", req, {
//       userId: userinfo.sub,
//       email: userinfo.email,
//     });

//     req.session.save(() => {
//       res.json({
//         success: true,
//         user: req.session.user,
//       });
//     });
//   } catch (e) {
//     console.error("Login failed:", e?.response?.data || e.message);

//     // Log failed login
//     await logAuthEvent("LOGIN_FAILURE", req, {
//       email,
//       reason: e?.response?.data?.error_description || e.message,
//     });

//     const errorMsg =
//       e?.response?.data?.error_description || "Invalid credentials";
//     res.status(401).json({ error: errorMsg });
//   }
// });

// single logout
// router.post('/logout', async (req, res) => {
//       try {
//             const userId = req.session.user?.sub;
//             const email = req.session.user?.email;
//             const refreshToken = req.session.tokens?.refresh;
//             const accessToken = req.session.tokens?.access;
//             const frontendReturn = process.env.FRONTEND_HOST;

//             await removeSessionForUser(userId, req.sessionID);
//             req.session.destroy(() => { });

//             await revokeTokens(refreshToken, accessToken);

//             // Log 
//             await logAuthEvent('LOGOUT', req, {
//                   userId,
//                   email
//             });

//             return res.json({ ok: true, logoutUrl: frontendReturn });
//       } catch (e) {
//             console.error('logout error', e);
//             res.status(500).json({ ok: false });
//       }
// });

// // logout from all devices
// router.post('/logout-all', async (req, res) => {
//   try {
//     const userId = req.session.user?.sub;
//     const email = req.session.user?.email;
//     const idToken = req.session.tokens?.id;
//     const refreshToken = req.session.tokens?.refresh;
//     const accessToken = req.session.tokens?.access;
//     const kcHost = process.env.KC_HOST_FULL;
//     const realm = process.env.KEYCLOAK_REALM;
//     const frontendReturn = process.env.FRONTEND_HOST;

//     // // destroy backend session
//     // req.session.destroy(() => { });
//     // await removeSessionForUser(userId, req.sessionID);

//     if (idToken && accessToken) {

//       const decoded = jwt.decode(idToken);
//       const userId = decoded?.sub;

//       if (!userId) {
//         return res.status(400).json({ ok: false, error: 'Invalid ID token' });
//       }

//       await revokeTokens(refreshToken, accessToken);

//       // Get admin token to access Keycloak Admin API
//       const adminTokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
//       const adminBody = new URLSearchParams({
//         grant_type: 'client_credentials',
//         client_id: clientId,
//         client_secret: clientSecret
//       }).toString();

//       const { data: adminTokens } = await axios.post(adminTokenUrl, adminBody, {
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//       });

//       const logoutAllUrl = `${kcHost}/admin/realms/${realm}/users/${userId}/logout`;

//       await axios.post(logoutAllUrl, {}, {
//         headers: {
//           'Authorization': `Bearer ${adminTokens.access_token}`,
//           'Content-Type': 'application/json'
//         }
//       });

//       const sessionIds = await getSessionsForUser(userId);
//       console.log(`[LOGOUT_ALL] Destroying ${sessionIds.length} sessions for user ${userId}`);
//       for (const sid of sessionIds) {
//         await destroySessionById(sid);
//       }
//       await clearAllSessionsForUser(userId);

//       await removeSessionForUser(userId, req.sessionID);
//       req.session.destroy(() => { });

//       await logAuthEvent('LOGOUT_ALL', req, {
//         userId: userId,
//         email
//       });

//       return res.json({
//         ok: true,
//         message: 'Logged out from all devices silently'
//       });
//     }

//     await removeSessionForUser(userId, req.sessionID);
//     req.session.destroy(() => { });
//     return res.json({ ok: true });
//   } catch (e) {
//     console.error('global logout error', e?.response?.data || e.message);
//     res.status(500).json({ ok: false, error: e.message });
//   }
// });


