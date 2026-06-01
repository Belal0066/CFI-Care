const { requireApiAuth } = require("../../../../backend/src/Nodejs/middleware/requireApiAuth");

jest.mock("../../../../backend/src/Nodejs/middleware/requireBearerJWT", () => ({
requireBearerJwt: jest.fn((req, res, next) => next()),
}));

const { requireBearerJwt } = require("../../../../backend/src/Nodejs/middleware/requireBearerJWT");

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

describe("requireApiAuth security", () => {
beforeEach(() => {
jest.clearAllMocks();
});

test("SEC-API-001: rejects missing bearer token", () => {
const req = { headers: {}, originalUrl: "/api/patients", method: "GET" };
const res = createRes();
const next = jest.fn();

requireApiAuth(req, res, next);

expect(res.statusCode).toBe(401);
expect(res.body).toEqual({ error: "Missing bearer token" });
expect(next).not.toHaveBeenCalled();
expect(requireBearerJwt).not.toHaveBeenCalled();
});

test("SEC-API-002: rejects malformed authorization header", () => {
const req = {
headers: { authorization: "Basic abc123" },
originalUrl: "/api/patients",
method: "GET",
};
const res = createRes();
const next = jest.fn();

requireApiAuth(req, res, next);

expect(res.statusCode).toBe(401);
expect(res.body).toEqual({ error: "Missing bearer token" });
expect(next).not.toHaveBeenCalled();
});

test("SEC-API-008: forwards valid bearer flow to JWT middleware", () => {
const req = {
headers: { authorization: "Bearer token123" },
originalUrl: "/api/patients",
method: "GET",
};
const res = createRes();
const next = jest.fn();

requireApiAuth(req, res, next);

expect(requireBearerJwt).toHaveBeenCalledTimes(1);
expect(next).toHaveBeenCalledTimes(1);
});
});