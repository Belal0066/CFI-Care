const express = require('express');

// const generatePkce = pkcePKG.default;
// const qs = require('querystring');

// const axios = require('axios');
// const Redis = require('ioredis');
// const { createClient } = require('redis');
// const cookie = require('cookie');

// const cookieParser = require('cookie-parser');
// const redisClient = createClient({ url: process.env.REDIS_URL });
// redisClient.on('error', (err) => console.error('Redis error', err));
// (async () => { try { await redisClient.connect(); } catch (e) { console.error('Redis connect failed', e); } })();


const pkce = require('pkce-challenge');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');



const kcHost = process.env.KC_HOSTNAME;
const realm = process.env.KEYCLOAK_REALM;
const clientId = process.env.KC_CLIENT_ID;
const clientSecret = process.env.KC_CLIENT_SECRET;
const redirectUri = `${process.env.BACKEND_HOSTNAME}/auth/callback`;

// /auth/login -> keycloak token endpoint (Direct Access Grants) --> resource owner pass creds? 
router.post('/login', async (req, res) => {
      const { email, password } = req.body;
      
      if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
      }

      const tokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
      const body = new URLSearchParams({
            grant_type: 'password',
            client_id: clientId,
            client_secret: clientSecret,
            username: email,
            password: password,
            scope: 'openid profile email'
      }).toString();

      try {
            const { data: tokens } = await axios.post(tokenUrl, body, {
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { data: userinfo } = await axios.get(
                  `${kcHost}/realms/${realm}/protocol/openid-connect/userinfo`,
                  { headers: { Authorization: `Bearer ${tokens.access_token}` } }
            );

            // store in session
            req.session.tokens = {
                  access: tokens.access_token,
                  refresh: tokens.refresh_token,
                  id: tokens.id_token,
                  exp: Date.now() + tokens.expires_in * 1000,
                  refresh_exp: Date.now() + tokens.refresh_expires_in * 1000,
            };
            req.session.user = { sub: userinfo.sub, email: userinfo.email, name: userinfo.name };
            
            req.session.save(() => {
                  res.json({ 
                        success: true, 
                        user: req.session.user 
                  });
            });
      } catch (e) {
            console.error('Login failed:', e?.response?.data || e.message);
            const errorMsg = e?.response?.data?.error_description || 'Invalid credentials';
            res.status(401).json({ error: errorMsg });
      }
});

// /auth/register - create user vai Keycloak Admin API
router.post('/register', async (req, res) => {
      const { email, password, fullName } = req.body;
      
      if (!email || !password || !fullName) {
            return res.status(400).json({ error: 'Email, password, and full name required' });
      }

      try {
            // admin access token using client credentials
            const adminTokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
            const adminBody = new URLSearchParams({
                  grant_type: 'client_credentials',
                  client_id: clientId,
                  client_secret: clientSecret
            }).toString();

            const { data: adminTokens } = await axios.post(adminTokenUrl, adminBody, {
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            // create user
            const [firstName, ...lastNameParts] = fullName.trim().split(' ');
            const lastName = lastNameParts.join(' ') || firstName;

            const createUserUrl = `${kcHost}/admin/realms/${realm}/users`;
            const userData = {
                  username: email,
                  email: email,
                  firstName: firstName,
                  lastName: lastName,
                  enabled: true,
                  emailVerified: false,
                  credentials: [{
                        type: 'password',
                        value: password,
                        temporary: false
                  }]
            };

            await axios.post(createUserUrl, userData, {
                  headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminTokens.access_token}`
                  }
            });

            // auto-login after registration
            // and error handling? or probably just a mistake on my end :/
            //  but i added this anyways:
            // if Direct Access Grants are disabled in KC return 201 with a prompt to log in manually instead of failing registration.
            try {
                  const loginTokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;
                  const loginBody = new URLSearchParams({
                        grant_type: 'password',
                        client_id: clientId,
                        client_secret: clientSecret,
                        username: email,
                        password: password,
                        scope: 'openid profile email'
                  }).toString();

            const { data: tokens } = await axios.post(loginTokenUrl, loginBody, {
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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
            req.session.user = { sub: userinfo.sub, email: userinfo.email, name: userinfo.name };

                  return req.session.save(() => {
                        res.status(201).json({ 
                              success: true,
                              autoLogin: true,
                              user: req.session.user 
                        });
                  });
            } catch (autoLoginErr) {
                  const errData = autoLoginErr?.response?.data || {};
                  const isUnauthorizedClient = errData.error === 'unauthorized_client';
                  const message = isUnauthorizedClient
                        ? 'User created. Direct Access Grants are disabled for this client; please log in manually.'
                        : 'User created. Please log in.';

                  console.warn('Auto-login after registration skipped:', errData || autoLoginErr.message);
                  return res.status(201).json({ 
                        success: true,
                        autoLogin: false,
                        message,
                        reason: errData.error_description || errData.error || autoLoginErr.message
                  });
            }
      } catch (e) {
            console.error('Registration failed:', e?.response?.data || e.message);
            if (e?.response?.status === 409) {
                  return res.status(409).json({ error: 'User already exists' });
            }
            const errorMsg = e?.response?.data?.errorMessage || 'Registration failed';
            res.status(400).json({ error: errorMsg });
      }
});



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

router.get('/me', (req, res) => {
      if (!req.session.user) return res.status(401).json({ authenticated: false });
      res.json({ authenticated: true, user: req.session.user });
});


router.post('/logout', async (req, res) => {
      try {
            const idToken = req.session.tokens?.id;
            req.session.destroy(() => { });
            if (idToken) {
                  const kcHost = process.env.KC_HOSTNAME;
                  const realm = process.env.KEYCLOAK_REALM;
                  const frontendReturn = process.env.FRONTEND_HOST;
                  const kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(frontendReturn)}`;
                  return res.json({ ok: true, logoutUrl: kcLogout });
            }
            return res.json({ ok: true });
      } catch (e) {
            console.error('logout error', e);
            res.status(500).json({ ok: false });
      }
});



// router.refreshTokens = refreshTokens;
module.exports = router;

//  legacy :<<<<

// router.get('/whoami', (req, res) => {
//       try {
//             const forwarded = req.headers['x-access-token'];
//             if (!forwarded) return res.status(401).json({ error: 'Access token missing' });
//             const decoded = jwt.decode(forwarded);
//             if (!decoded) return res.status(401).json({ error: 'Invalid token' });
//             const { sub, email } = decoded;
//             return res.json({ sub, email });
//       } catch (err) {
//             console.error('whoami error:', err && err.message);
//             return res.status(500).json({ error: 'Server error' });
//       }
// });


// async function deleteOauth2ProxySession(req, res) {
//       try {
//             const cookieName = process.env.OAUTH_COOKIE_NAME;

//             let rawCookie = (req.cookies && req.cookies[cookieName]) || null;
//             if (!rawCookie && req.headers && req.headers.cookie) {
//                   const parsed = cookie.parse(req.headers.cookie || '');
//                   rawCookie = parsed[cookieName];
//             }
//             if (!rawCookie) {
//                   return res.status(400).json({ ok: false, error: 'No oauth2-proxy cookie found' });
//             }

//             // Signed value may be "value|sig" 
//             const unsignedCandidate = rawCookie.split('|')[0];


//             // - v2.{base64(ticketID)}.{base64(secret)}
//             const parts = unsignedCandidate.split('.');
//             let ticketId = null;

//             if (parts.length === 3 && parts[0] === 'v2') {
//                   try {
//                         ticketId = Buffer.from(parts[1], 'base64').toString('utf8');
//                   } catch (e) {
//                         console.error('deleteOauth2ProxySession error decoding ticketId from v2 cookie:', e && e.message);
//                   }
//             } else {
//                   // fallback
//                   if (unsignedCandidate.includes('-')) {
//                         ticketId = unsignedCandidate;
//                   }
//             }

//             if (!ticketId) {
//                   return res.status(400).json({ ok: false, error: 'Could not decode oauth2-proxy ticket id from cookie' });
//             }
//             const delCount = await redisClient.del(ticketId);

//             let cleanedSets = 0;
//             for await (const key of redisClient.scanIterator({ MATCH: '*kc_sid*', COUNT: 200 })) {
//                   try {
//                         const t = await redisClient.type(key);
//                         if (t === 'set') {
//                               const removed = await redisClient.sRem(key, ticketId);
//                               if (removed) cleanedSets++;
//                         }
//                   } catch (e) {
//                         console.error('deleteOauth2ProxySession error cleaning sets:', e && e.message);
//                   }
//             }

//             // scan for keys which include the ticketId substring and delete them.
//             let deletedMatches = 0;
//             const pattern = `*${ticketId}*`;
//             for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 200 })) {
//                   try {
//                         await redisClient.del(key);
//                         deletedMatches++;
//                   } catch (e) { console.error('deleteOauth2ProxySession error deleting matched key:', e && e.message); }
//             }



//             return res.json({
//                   ok: true,
//                   ticketId,
//                   primaryDeleted: delCount > 0,
//                   cleanedSets,
//                   deletedMatches,
//             });
//       } catch (err) {
//             console.error('deleteOauth2ProxySession error', err);
//             return res.status(500).json({ ok: false, error: String(err) });
//       }
// }
// //for CSRF
// function requireSameOrigin(req, res, next) {
//       const origin = req.get('origin') || req.get('referer') || '';
//       const allowed = process.env.FRONTEND_HOST;
//       if (!origin) {
//             console.warn('Missing origin or referer header');
//             return res.status(403).json({ error: 'Missing origin/referrer' });
//       }
//       if (!origin.startsWith(allowed)) {
//             console.warn('Invalid origin:', origin);
//             return res.status(403).json({ error: 'Invalid origin' });
//       }
//       return next();
// }

// // router.get('/logout', handleLogout);
// router.post('/global-logout', requireSameOrigin, deleteOauth2ProxySession);

// router.get('/logout', async (req, res) => {


//       try {

//             const kcHost = process.env.KC_HOSTNAME;
//             const realm = process.env.KEYCLOAK_REALM;
//             const frontend= process.env.CLIENT_ID ;
//             // let idToken = null;
//             //  if (req.kauth && req.kauth.token && req.kauth.token.id_token && req.kauth.token.id_token.raw) {
//             //             idToken = req.kauth.token.id_token.raw;
//             //             console.log('Found id token for logout hint:', idToken );
//             //       }

//             let kcLogout;
//             // if (idToken) {
//             //  kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?id_token_hint=${idToken}`//client_id=${frontend}`; //${encodeURIComponent(frontend)}`;
//             // } else {
//             kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?client_id=${frontend}`;
//             // }
//             const signOutBase = process.env.OAUTH2_PROXY_SIGNOUT_URL;
//             const fulllogoutURL = `${signOutBase}?rd=${encodeURIComponent(kcLogout)}`;
//             res.status(302).redirect(fulllogoutURL);


//             // const returnTo = kcLogout;

//             // const html = `<!doctype html><html><head><meta charset="utf-8"><title>Signing out</title></head><body>
//             //                   <form id="logoutForm" method="POST" action="/oauth2/sign_out?returnTo=${encodeURIComponent(returnTo)}">
//             //                   </form>
//             //                   <script>document.getElementById('logoutForm').submit();</script>
//             //                   </body></html>`;

//             // res.set('Content-Type', 'text/html');
//             // return res.send(html);
//       } catch (err) {
//             console.error('logout error:', err && err.message);
//             return res.redirect('/');
//       }
// });

// router.post('/logout', async (req, res) => {
//       try {
//             const kcHost = process.env.KC_HOSTNAME;
//             const realm = process.env.KEYCLOAK_REALM;
//             const frontendReturn = process.env.FRONTEND_HOST ;
//             const kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(frontendReturn)}`;
//             const signOutBase = process.env.OAUTH2_PROXY_SIGNOUT_URL || '/oauth2/sign_out';
//             const fulllogoutURL = `${signOutBase}?rd=${encodeURIComponent(kcLogout)}`;
//             return res.json({ ok: true, logoutUrl: fulllogoutURL });
//       } catch (err) {
//             console.error('logout (post) error:', err && err.message);
//             return res.status(500).json({ ok: false });
//       }
// });

// router.get('/login', (req, res) => {
//       res.status(302).redirect('../');
// });

// router.get('/login-mobile', async (req, res) => {
// res.status(302).redirect('oauth2/start');
//     let code_challenge, code_verifier;
//     try{
//     ({code_challenge, code_verifier }= await generatePkce());
//     }
//     catch(err){
//         console.error('PKCE generation error:', err);
//         return res.status(500).send('Internal Server Error');
//     }
//     req.session.code_verifier = code_verifier;

//     const redirectUri = `${process.env.BACKEND_HOSTNAME}/auth/callback` ;
//     const authURL = `${process.env.KC_HOSTNAME}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/auth` ;
//     const params = {
//         client_id: process.env.KC_CLIENT_ID,
//         redirect_uri: redirectUri,
//         response_type: 'code',
//         scope: 'openid profile patient/*.rs ',
//         code_challenge: code_challenge,
//         code_challenge_method: 'S256',
//         state: Math.random().toString(36).slice(2)
//     };

//     req.session.oauthState = params.state;
//     const redirectTo = `${authURL}?${qs.stringify(params)}`;
//     console.log('Prepared Keycloak URL:', redirectTo);

//     // Ensure session is persisted to the store before redirecting so the callback
//     // can read `req.session.oauthState`. This avoids state mismatches when the
//     // session store writes are asynchronous (Redis, etc.).
//     req.session.save((err) => {
//         if (err) console.error('Session save error before redirect:', err);
//         console.log('Redirecting to Keycloak with URL:', redirectTo);
//         return res.redirect(redirectTo);
//     });
// });


// router.get('/callback', async (req, res) => {
//     const { code, state } = req.query;

//     console.log('callback query:', req.query);
//     console.log('Callback cookies header:', req.headers.cookie);
//     console.log('Session at callback:', req.session);

//     if (state !== req.session.oauthState) {
//         console.warn('State mismatch. expected:', req.session && req.session.oauthState, 'got:', state);
//         return res.status(403).send('Invalid clallback parameter');
//     }
//     // Post directly to the realm token endpoint
//     const tokenURL = `${process.env.KC_HOSTNAME}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
//     const codeVerifier = req.session.code_verifier;

//     try {
//         const body = new URLSearchParams({
//             grant_type: 'authorization_code',
//             client_id: process.env.KC_CLIENT_ID,
//             client_secret: process.env.KC_CLIENT_SECRET,
//             redirect_uri: `${process.env.BACKEND_HOSTNAME}/auth/callback`,
//             code,
//             code_verifier : codeVerifier
//         }).toString();

//         const response = await axios.post(tokenURL, body, {
//             headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//         });

//         const tokens = response.data;
//         console.log('Token response:', tokens);
//         tokens.expires_at = Date.now() + (tokens.expires_in * 1000);

//         req.session.tokenSet = tokens;
//         return res.redirect('/');
//     } catch (error) {
//         console.error('Error during code exchange:', error && error.message);
//         if (error && error.response) console.error('token endpoint response:', error.response.status, error.response.data);
//         return res.status(500).send('Authentication failed');
//     }
// });

