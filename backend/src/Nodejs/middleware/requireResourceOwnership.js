function getClaims(req) {
	if (req.jwt && typeof req.jwt === "object") return req.jwt;
	if (req.kauth?.token?.grant && typeof req.kauth.token.grant === "object") {
		return req.kauth.token.grant;
	}
	return null;
}

function collectRoles(claims) {
	const roles = new Set();
	for (const r of claims?.realm_access?.roles || []) roles.add(r);
	const ra = claims?.resource_access || {};
	for (const client of Object.values(ra)) {
		for (const r of client?.roles || []) roles.add(r);
	}
	return roles;
}

function parseCsvSet(v, fallback = []) {
	if (!v || typeof v !== "string") return new Set(fallback);
	return new Set(v.split(",").map(x => x.trim()).filter(Boolean));
}

function requireResourceOwnership(options = {}) {
	const paramName = options.paramName || "id";
	const bypassRoles = parseCsvSet(
		process.env.OWNERSHIP_BYPASS_ROLES,
		["admin"]
	);

	return function ownershipGuard(req, res, next) {
		try {
			const claims = getClaims(req);
			if (!claims) {
				return res.status(401).json({ error: "Unauthorized: missing token claims" });
			}

			const requesterId = claims.sub;
			if (!requesterId) {
				return res.status(401).json({ error: "Unauthorized: missing subject claim" });
			}

			const resourceId = req.params?.[paramName];
			if (!resourceId) {
				return res.status(400).json({
					error: `Bad request: missing route parameter '${paramName}'`,
				});
			}

			const roles = collectRoles(claims);
			for (const role of roles) {
				if (bypassRoles.has(role)) return next();
			}

			if (requesterId !== resourceId) {
				return res.status(403).json({
					error: "Forbidden: resource does not belong to this subject",
				});
			}

			return next();
		} catch (err) {
			return res.status(500).json({ error: "Ownership validation failed", detail: err.message });
		}
	};
}


module.exports = { requireResourceOwnership };

