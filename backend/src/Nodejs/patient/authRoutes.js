const express = require('express');
// const pkcePKG = require ('pkce-challenge');
// const generatePkce = pkcePKG.default;
// const qs = require('querystring');

// const axios = require('axios');
// const Redis = require('ioredis');
const { createClient } = require('redis');
const cookie = require('cookie');
// const cookieParser = require('cookie-parser');
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('Redis error', err));
(async () => { try { await redisClient.connect(); } catch (e) { console.error('Redis connect failed', e); } })();


const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');

router.get('/whoami', (req, res) => {
      try {
            const forwarded = req.headers['x-access-token'];
            if (!forwarded) return res.status(401).json({ error: 'Access token missing' });
            const decoded = jwt.decode(forwarded);
            if (!decoded) return res.status(401).json({ error: 'Invalid token' });
            const { sub, email } = decoded;
            return res.json({ sub, email });
      } catch (err) {
            console.error('whoami error:', err && err.message);
            return res.status(500).json({ error: 'Server error' });
      }
});


async function deleteOauth2ProxySession(req, res) {
      try {
            const cookieName = process.env.OAUTH_COOKIE_NAME;

            let rawCookie = (req.cookies && req.cookies[cookieName]) || null;
            if (!rawCookie && req.headers && req.headers.cookie) {
                  const parsed = cookie.parse(req.headers.cookie || '');
                  rawCookie = parsed[cookieName];
            }
            if (!rawCookie) {
                  return res.status(400).json({ ok: false, error: 'No oauth2-proxy cookie found' });
            }

            // Signed value may be "value|sig" 
            const unsignedCandidate = rawCookie.split('|')[0];


            // - v2.{base64(ticketID)}.{base64(secret)}
            const parts = unsignedCandidate.split('.');
            let ticketId = null;

            if (parts.length === 3 && parts[0] === 'v2') {
                  try {
                        ticketId = Buffer.from(parts[1], 'base64').toString('utf8');
                  } catch (e) {
                        console.error('deleteOauth2ProxySession error decoding ticketId from v2 cookie:', e && e.message);
                  }
            } else {
                  // fallback
                  if (unsignedCandidate.includes('-')) {
                        ticketId = unsignedCandidate;
                  }
            }

            if (!ticketId) {
                  return res.status(400).json({ ok: false, error: 'Could not decode oauth2-proxy ticket id from cookie' });
            }
            const delCount = await redisClient.del(ticketId);

            let cleanedSets = 0;
            for await (const key of redisClient.scanIterator({ MATCH: '*kc_sid*', COUNT: 200 })) {
                  try {
                        const t = await redisClient.type(key);
                        if (t === 'set') {
                              const removed = await redisClient.sRem(key, ticketId);
                              if (removed) cleanedSets++;
                        }
                  } catch (e) {
                        console.error('deleteOauth2ProxySession error cleaning sets:', e && e.message);
                  }
            }

            // scan for keys which include the ticketId substring and delete them.
            let deletedMatches = 0;
            const pattern = `*${ticketId}*`;
            for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 200 })) {
                  try {
                        await redisClient.del(key);
                        deletedMatches++;
                  } catch (e) { console.error('deleteOauth2ProxySession error deleting matched key:', e && e.message); }
            }



            return res.json({
                  ok: true,
                  ticketId,
                  primaryDeleted: delCount > 0,
                  cleanedSets,
                  deletedMatches,
            });
      } catch (err) {
            console.error('deleteOauth2ProxySession error', err);
            return res.status(500).json({ ok: false, error: String(err) });
      }
}
//for CSRF
function requireSameOrigin(req, res, next) {
      const origin = req.get('origin') || req.get('referer') || '';
      const allowed = process.env.FRONTEND_HOST;
      if (!origin) {
            console.warn('Missing origin or referer header');
            return res.status(403).json({ error: 'Missing origin/referrer' });
      }
      if (!origin.startsWith(allowed)) {
            console.warn('Invalid origin:', origin);
            return res.status(403).json({ error: 'Invalid origin' });
      }
      return next();
}

// router.get('/logout', handleLogout);
router.post('/global-logout', requireSameOrigin, deleteOauth2ProxySession);

router.get('/logout', async (req, res) => {


      try {
          
            const kcHost = process.env.KC_HOSTNAME;
            const realm = process.env.KEYCLOAK_REALM;
            const frontend= process.env.CLIENT_ID ;
            // let idToken = null;
            //  if (req.kauth && req.kauth.token && req.kauth.token.id_token && req.kauth.token.id_token.raw) {
            //             idToken = req.kauth.token.id_token.raw;
            //             console.log('Found id token for logout hint:', idToken );
            //       }
           
            let kcLogout;
            // if (idToken) {
            //  kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?id_token_hint=${idToken}`//client_id=${frontend}`; //${encodeURIComponent(frontend)}`;
            // } else {
            kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?client_id=${frontend}`;
            // }
            const signOutBase = process.env.OAUTH2_PROXY_SIGNOUT_URL;
            const fulllogoutURL = `${signOutBase}?rd=${encodeURIComponent(kcLogout)}`;
            res.status(302).redirect(fulllogoutURL);


            // const returnTo = kcLogout;

            // const html = `<!doctype html><html><head><meta charset="utf-8"><title>Signing out</title></head><body>
            //                   <form id="logoutForm" method="POST" action="/oauth2/sign_out?returnTo=${encodeURIComponent(returnTo)}">
            //                   </form>
            //                   <script>document.getElementById('logoutForm').submit();</script>
            //                   </body></html>`;

            // res.set('Content-Type', 'text/html');
            // return res.send(html);
      } catch (err) {
            console.error('logout error:', err && err.message);
            return res.redirect('/');
      }
});

router.post('/logout', async (req, res) => {
      try {
            const kcHost = process.env.KC_HOSTNAME;
            const realm = process.env.KEYCLOAK_REALM;
            const frontendReturn = process.env.FRONTEND_HOST ;
            const kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(frontendReturn)}`;
            const signOutBase = process.env.OAUTH2_PROXY_SIGNOUT_URL || '/oauth2/sign_out';
            const fulllogoutURL = `${signOutBase}?rd=${encodeURIComponent(kcLogout)}`;
            return res.json({ ok: true, logoutUrl: fulllogoutURL });
      } catch (err) {
            console.error('logout (post) error:', err && err.message);
            return res.status(500).json({ ok: false });
      }
});

// router.get('/login', (req, res) => {
//       res.status(302).redirect('../');
// });

router.get('/login-mobile', async (req, res) => {
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
});


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

module.exports = router;