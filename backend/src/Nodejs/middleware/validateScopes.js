

function parseScopes(payload) {
    if (!payload) return new Set();
    if (typeof payload.scope === 'string' && payload.scope.trim()) {
        return new Set(payload.scope.split(/\s+/).filter(Boolean));
    }
    if (payload.authorization && Array.isArray(payload.authorization.permissions)) {
        const scopes = new Set();
        for (const perm of payload.authorization.permissions) {
            if (Array.isArray(perm.scopes)) {
                for (const scope of perm.scopes) {
                    scopes.add(scope);
                }
            } else if (typeof perm.scope === 'string' && perm.scope.trim()) {
                perm.scope.split(/\s+/).forEach(x => scopes.add(x));
            }
        }
        if (scopes.size) return scopes;
    }
    return new Set();
}


// match SMART for FHIR scopes to scpes granted in token
function scopeMatches(requiredScope, tokenScope) {
    if (!requiredScope || !tokenScope) return false;
    if (requiredScope === tokenScope) return true;
    const parse = (s) => {
        const index = s.lastIndexOf('.');
        if (index === -1) return { left: s, action: '' };
        return { left: s.slice(0, index), action: s.slice(index + 1) };
    };
    const req = parse(requiredScope);
    const tok = parse(tokenScope);
    if (tok.action && req.action && tok.action !== req.action && tok.action !== '*') return false;
    const leftMatch = (pattern, actual) => {
        if (pattern === actual) return true;
        if (pattern === '*') return true;
        if (pattern.endsWith('*')) {
            return actual.startsWith(pattern.slice(0, -1));
        }
        return false;
    };
    return leftMatch(req.left, tok.left) || leftMatch(tok.left, req.left);
}


// validate scope
function requireScopes(requiredScopes = []) {
    return function (req, res, next) {
        try {
            const payload = req.kauth && req.kauth.token && req.kauth.token.grant;
            if (!payload) {
                return res.status(401).json({ error: 'Unauthorized: missing payload' });
            }
            const tokenScopes = parseScopes(payload);
            const realmRoles = (payload.realm_access && Array.isArray(payload.realm_access.roles)) ? new Set(payload.realm_access.roles) : new Set();

            const hasRequiredScopes = (reqScope) => {
                for (const tokenScope of tokenScopes) {
                    if (scopeMatches(reqScope, tokenScope)) {
                        return true;
                    }
                }
                if (realmRoles.has('admin')) return true;

                return false;
            }

            for (const reqScope of requiredScopes) {
                let matched = false;
                if (!hasRequiredScopes(reqScope)) {
                    {
                        return res.status(403).json({ error: 'Forbidden: insufficient scopes', required: requiredScopes });
                    }

                }
            }

                const wantsPatientScope = requiredScopes.some(s => s.startsWith('patient/'));
                if (wantsPatientScope) {
                    const patientClaim = payload.patient || payload.patient_id || null;
                    if (patientClaim && req.params && req.params.id) {
                        if (patientClaim !== req.params.id) {
                            return res.status(403).json({ error: 'Forbidden: patient scope does not match requested patient ID' });
                        }
                    }
                }
                next();
            } catch (error) {
                console.error('Error in requireScopes middleware:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }


    module.exports = requireScopes;