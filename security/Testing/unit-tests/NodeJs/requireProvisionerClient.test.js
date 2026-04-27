const { requireProvisionerClient } = require("../../../../backend/src/Nodejs/middleware/requireProvisionerClient");

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

describe("requireProvisionerClient security", () => {
const oldEnv = process.env.KC_PROVISIONER_CLIENT_ID;

afterEach(() => {
if (oldEnv === undefined) {
delete process.env.KC_PROVISIONER_CLIENT_ID;
} else {
process.env.KC_PROVISIONER_CLIENT_ID = oldEnv;
}
});

test("SEC-API-011: returns 500 when expected provisioner id is missing", () => {
delete process.env.KC_PROVISIONER_CLIENT_ID;
const req = { jwt: { azp: "svc-a" } };
const res = createRes();
const next = jest.fn();

requireProvisionerClient(req, res, next);

expect(res.statusCode).toBe(500);
expect(res.body).toEqual({ error: "Server misconfiguration" });
expect(next).not.toHaveBeenCalled();
});

test("SEC-API-009: rejects non-allowlisted caller", () => {
process.env.KC_PROVISIONER_CLIENT_ID = "kc-provisioner";
const req = { jwt: { azp: "other-client" } };
const res = createRes();
const next = jest.fn();

requireProvisionerClient(req, res, next);

expect(res.statusCode).toBe(403);
expect(res.body).toEqual({ error: "Forbidden caller" });
expect(next).not.toHaveBeenCalled();
});

test("SEC-API-010: accepts allowlisted caller via azp", () => {
process.env.KC_PROVISIONER_CLIENT_ID = "kc-provisioner";
const req = { jwt: { azp: "kc-provisioner" } };
const res = createRes();
const next = jest.fn();

requireProvisionerClient(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
});

test("SEC-API-010b: accepts allowlisted caller via client_id", () => {
process.env.KC_PROVISIONER_CLIENT_ID = "kc-provisioner";
const req = { jwt: { client_id: "kc-provisioner" } };
const res = createRes();
const next = jest.fn();

requireProvisionerClient(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
});
});