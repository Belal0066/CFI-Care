const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require('crypto');

const {
  loginLimiter,
  registerLimiter,
  logoutLimiter,
  generalLimiter
} = require("../middleware/rateLimiter");
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
  const { code, state, error, error_description, kc_action_status } = req.query;

  if (error || kc_action_status === 'cancelled') {
    console.warn('Keycloak callback cancelled:', {
      error,
      error_description,
      kc_action_status,
    });

    const redirectTarget =
      req.session?.redirect_after_auth || process.env.FRONTEND_HOST;

    return res.redirect(redirectTarget);
  }

  if (!code || state !== req.session.oauth_state) {
    return res.status(400).send('Invalid state or code');
  }

  if (kc_action_status === 'success') {
    const redirectTarget =
      req.session?.redirect_after_auth || process.env.FRONTEND_HOST;

    return res.redirect(redirectTarget);
  }

  const tokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: req.session.code_verifier,
  }).toString();

  try {
    const { data: tokens } = await axios.post(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

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

    req.session.user = {
      sub: userinfo.sub,
      email: userinfo.email,
      name: userinfo.name,
    };

    const redirectTarget =
      req.session.redirect_after_auth || process.env.FRONTEND_HOST || '/';

    req.session.save(() => {
      res.redirect(redirectTarget);
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
    req.session.save(() => { });
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

router.get('/logout', logoutLimiter, async (req, res) => {
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
      `&client_id=${encodeURIComponent(process.env.BROWSER_CLIENT_ID)}`;

    if (idTokenHint) {
      kcLogout += `&id_token_hint=${encodeURIComponent(idTokenHint)}`;
    }

    const fullLogoutURL = `${process.env.OAUTH2_PROXY_SIGNOUT_URL}` + `?rd=${encodeURIComponent(kcLogout)}`;

    return res.redirect(302, fullLogoutURL);


  } catch (e) {
    console.error('logout redirect error:', e?.message || e);
    return res.redirect('/oauth2/start?rd=%2Fdashboard');
  }
});

router.post('/logout-all', logoutLimiter, async (req, res) => {
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

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

//  for dashboard set totp/reset pass buttons to route correctly to keycloak, i've tried many other appraoches before resorting to another backend api call
router.get('/start', generalLimiter, (req, res) => {
  try {
    const kcHost = process.env.KC_HOST_FULL;
    const realm = process.env.KEYCLOAK_REALM;
    const redirectUri = `${process.env.BACKEND_HOSTNAME}/auth/callback`;

    const kcAction = req.query.kc_action;
    const rd = req.query.rd || '/dashboard';
    let loginHint = req.query.login_hint;

    // const rawAuthz = req.headers["x-auth-request-id-token"] || "";
    // const idTokenHint = String(rawAuthz).startsWith("Bearer ") ? String(rawAuthz).slice(7) : rawAuthz || null;

    // fallback to get login_hint from id_token claims if it'sy not provided
    // if (!loginHint && idTokenHint) {
    //   try {
    //     const decoded = require('jsonwebtoken').decode(idTokenHint);
    //     if (decoded?.email) {
    //       loginHint = decoded.email;
    //     }
    //   } catch (e) {
    //     console.warn('Failed to decode id_token for login_hint:', e.message);
    //   }
    // }

    //PKCE
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

    const oauthState = base64url(crypto.randomBytes(16));

    // save for callback
    req.session.code_verifier = codeVerifier;
    req.session.oauth_state = oauthState;
    req.session.redirect_after_auth = rd;

    req.session.save(() => {
      const url = new URL(
        `${kcHost}/realms/${realm}/protocol/openid-connect/auth`
      );

      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'openid');
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('state', oauthState);

      if (kcAction) {
        url.searchParams.set('kc_action', kcAction);
      }

      if (loginHint) {
        url.searchParams.set('login_hint', loginHint);
      }

      // if (idTokenHint) {
      //   url.searchParams.set('id_token_hint', idTokenHint);
      // }

      return res.redirect(url.toString());
    });
  } catch (e) {
    console.error('start route error', e);
    return res.status(500).send('start error');
  }
});

module.exports = router;

