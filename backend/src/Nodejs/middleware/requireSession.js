
// const axios = require('axios');

// async function requireApiAuth(req, res, next) {
//     try {
//         // console.log("[requireApiAuth] HIT", {
//         //     url: req.originalUrl,
//         //     method: req.method,
//         //     authHeaderPresent: !!req.headers.authorization,
//         // });
//         console.log('[requireApiAuth] Session check:', {
//             hasSession: !!req.session,
//             hasUser: !!req.session?.user,
//             hasTokens: !!req.session?.tokens,
//             sessionID: req.sessionID
//         });

//         if (!req.session || !req.session.user || !req.session.tokens) {
//             console.log('[requireApiAuth] Rejecting - missing session data');
//             return res.status(401).json({ error: 'Not authenticated' });
//         }

//         const now = Date.now();
//         const exp = req.session.tokens.exp || 0;
//         const refreshExp = req.session.tokens.refresh_exp || 0;

//         if (now >= exp - 30000) {
//             if (!req.session.tokens.refresh || now >= refreshExp) {
//                 req.session.destroy(() => { });
//                 return res.status(401).json({ error: 'Session expired' });
//             }

//             try {
//                 await refreshTokens(req);
//             } catch (err) {
//                 console.error('Token refresh failed:', err?.response?.data || err?.message);
//                 req.session.destroy(() => { });
//                 return res.status(401).json({ error: 'Session expired' });
//             }
//         }

//         req.accessToken = req.session.tokens.access;
//         req.user = req.session.user;

//         // for now
//         req.kauth = {
//             token: {
//                 grant: {
//                     sub: req.session.user.sub
//                 }
//             }
//         };

//         return next();
//     } catch (err) {
//         console.error('requireApiAuth error:', err && err.message);
//         return res.status(500).json({ error: 'Auth check failed' });
//     }
// }

// async function refreshTokens(req) {
//     const kcHost = process.env.KC_HOSTNAME;
//     const realm = process.env.KEYCLOAK_REALM;
//     const clientId = process.env.KC_CLIENT_ID;
//     const tokenUrl = `${kcHost}/realms/${realm}/protocol/openid-connect/token`;

//     const body = new URLSearchParams({
//         grant_type: 'refresh_token',
//         client_id: clientId,
//         refresh_token: req.session.tokens.refresh,
//     }).toString();
//     const { data: tokens } = await axios.post(tokenUrl, body, {
//         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
//     });
//     req.session.tokens.access = tokens.access_token;
//     req.session.tokens.refresh = tokens.refresh_token || req.session.tokens.refresh;
//     req.session.tokens.exp = Date.now() + tokens.expires_in * 1000;
//     req.session.tokens.refresh_exp = Date.now() + (tokens.refresh_expires_in || 1800) * 1000;
//     await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
// }



// module.exports = { requireApiAuth, refreshTokens };
