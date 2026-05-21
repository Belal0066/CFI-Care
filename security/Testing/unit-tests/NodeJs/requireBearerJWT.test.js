const dotenv = require('dotenv');  

dotenv.config({ path: '.env.test' });


jest.mock("jwks-rsa", () => {
const factory = jest.fn(() => ({
getSigningKey: jest.fn((kid, cb) => cb(null, { getPublicKey: () => "PUBLIC_KEY" })),
}));
return factory;
});

jest.mock("jsonwebtoken", () => ({
verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");
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

describe("requireBearerJWT security", () => {
beforeEach(() => {
jest.clearAllMocks();
});

test("SEC-API-001b: rejects missing bearer token", () => {
const req = { headers: {} };
const res = createRes();
const next = jest.fn();

requireBearerJwt(req, res, next);

expect(res.statusCode).toBe(401);
expect(res.body.error).toContain("missing bearer token");
expect(next).not.toHaveBeenCalled();
});

test("SEC-API-003: rejects invalid JWT signature", () => {
jwt.verify.mockImplementation((token, getKey, options, cb) => {
cb(new Error("invalid signature"));
});

const req = { headers: { authorization: "Bearer bad.token" } };
const res = createRes();
const next = jest.fn();

requireBearerJwt(req, res, next);

expect(res.statusCode).toBe(401);
expect(res.body.error).toBe("Invalid token");
expect(next).not.toHaveBeenCalled();
});

test("SEC-API-008b: accepts valid JWT and attaches claims", () => {
jwt.verify.mockImplementation((token, getKey, options, cb) => {
cb(null, { sub: "u1", email: "a@b.com", azp: "client-a" });
});

const req = { headers: { authorization: "Bearer good.token" } };
const res = createRes();
const next = jest.fn();

requireBearerJwt(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
expect(req.jwt.sub).toBe("u1");
expect(req.user.email).toBe("a@b.com");
});
});