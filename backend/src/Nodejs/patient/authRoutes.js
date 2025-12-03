const express = require('express');
// const pkcePKG = require ('pkce-challenge');
// const generatePkce = pkcePKG.default;
// const qs = require('querystring');

// const axios = require('axios');

const router = express.Router();
const jwt = require('jsonwebtoken');

router.get('/whoami', (req, res) => {
      try {
            const forwarded =  req.headers['x-access-token'] ;
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

router.get('/logout', (req, res) => {
//       try {
//             res.status(302).redirect('oauth2/sign_out');
//       } catch (err) {
//             console.error('logout error:', err && err.message);
//             return res.redirect('/');
//       }

       try {
            const kcHost = process.env.KC_HOSTNAME ;
            const realm = process.env.KEYCLOAK_REALM;
            const frontendReturn = process.env.FRONTEND_HOST ;

            const kcLogout = `${kcHost}/realms/${realm}/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(frontendReturn)}`;
            const fulllogoutURL = `${process.env.OAUTH2_PROXY_SIGNOUT_URL}?rd=${encodeURIComponent(kcLogout)}`;
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

router.get('/login', async (req, res) => {
      res.status(302).redirect('oauth2/start');
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