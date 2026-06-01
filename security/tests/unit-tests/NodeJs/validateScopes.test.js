const requireScopes = require("../../../../backend/src/Nodejs/middleware/validateScopes");

function createRes() {
return {
statusCode: 200,
body: null,
status(code) {
this.statusCode = code;
return this;
},
json(payload) {
this.body = payload;
return this;
},
};
}

describe("validateScopes security", () => {
test("SEC-SCOPE-001: returns 401 when token payload is missing", () => {
const middleware = requireScopes(["patient/123.rs"]);
const req = {};
const res = createRes();
const next = jest.fn();

middleware(req, res, next);

expect(res.statusCode).toBe(401);
expect(res.body).toEqual({ error: "Unauthorized: missing payload" });
expect(next).not.toHaveBeenCalled();
});

test("SEC-SCOPE-001b: returns 403 for insufficient scopes", () => {
const middleware = requireScopes(["patient/123.rs"]);
const req = {
kauth: {
token: {
grant: {
scope: "openid profile",
realm_access: { roles: [] },
},
},
},
params: { id: "123" },
};
const res = createRes();
const next = jest.fn();

middleware(req, res, next);

expect(res.statusCode).toBe(403);
expect(res.body.error).toContain("insufficient scopes");
expect(next).not.toHaveBeenCalled();
});

test("SEC-SCOPE-003: accepts wildcard SMART scope", () => {
const middleware = requireScopes(["patient/123.rs"]);
const req = {
kauth: {
token: {
grant: {
scope: "patient/*.rs",
realm_access: { roles: [] },
patient: "123",
},
},
},
params: { id: "123" },
};
const res = createRes();
const next = jest.fn();

middleware(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
});

test("SEC-SCOPE-004: admin role bypasses missing scope", () => {
const middleware = requireScopes(["patient/123.rs"]);
const req = {
kauth: {
token: {
grant: {
scope: "openid profile",
realm_access: { roles: ["admin"] },
},
},
},
params: { id: "999" },
};
const res = createRes();
const next = jest.fn();

middleware(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
});

test("SEC-SCOPE-005: rejects patient claim mismatch", () => {
const middleware = requireScopes(["patient/123.rs"]);
const req = {
kauth: {
token: {
grant: {
scope: "patient/*.rs",
realm_access: { roles: [] },
patient: "111",
},
},
},
params: { id: "123" },
};
const res = createRes();
const next = jest.fn();

middleware(req, res, next);

expect(res.statusCode).toBe(403);
expect(res.body.error).toContain("patient scope does not match");
expect(next).not.toHaveBeenCalled();
});
});

