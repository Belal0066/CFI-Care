const express = require("express");
const supertest = require("supertest");

const mockAxios = {
  post: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
};
mockAxios.create.mockReturnValue(mockAxios);
jest.mock("../../../../backend/src/Nodejs/node_modules/axios", () => mockAxios);

const mockRequireApiAuth = jest.fn((req, res, next) => {
  req.jwt = { sub: "patient-123", realm_access: { roles: ["patient"] } };
  req.kauth = { token: { grant: { sub: "patient-123" } } };
  next();
});

jest.mock("../../../../backend/src/Nodejs/middleware/requireApiAuth", () => ({
  requireApiAuth: mockRequireApiAuth,
}));

jest.mock("../../../../backend/src/Nodejs/utils/logSecurityEvent", () => ({
  logSecurityEvent: jest.fn(),
}));

jest.mock("../../../../backend/src/Nodejs/utils/redisOTPCli", () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

jest.mock("../../../../backend/src/Nodejs/services/FCM_Send_Notification", () => ({
  sendNotif: jest.fn().mockResolvedValue(true),
}));

const mockResolveRequesterType = jest.fn().mockReturnValue("practitioner");
jest.mock("../../../../backend/src/Nodejs/services/Caller_Role_resolver", () => ({
  resolveRequesterType: mockResolveRequesterType,
}));

const mockHandshakeStorage = {
  clearExistingOtp: jest.fn().mockResolvedValue(true),
  createUniqueOtp: jest.fn().mockResolvedValue("654321"),
  ClearVerifiedOtp: jest.fn().mockResolvedValue("patient-123"),
  savePendingGrant: jest.fn().mockResolvedValue(true),
  getPendingGrant: jest.fn(),
  listPendingHandshakes: jest.fn(),
  deletePendingGrant: jest.fn().mockResolvedValue(true),
};
jest.mock("../../../../backend/src/Nodejs/services/Handshake_storage_redis", () => mockHandshakeStorage);

const mockGrantStorage = {
  saveGrant: jest.fn().mockResolvedValue(true),
  getGrant: jest.fn(),
  setCaregiverMappings: jest.fn().mockResolvedValue(true),
  getGrantByRequesterAndPatient: jest.fn(),
};
jest.mock("../../../../backend/src/Nodejs/services/Grant_Storage_Redis", () => mockGrantStorage);

const mockRoleAssignment = {
  addUserToGroup: jest.fn().mockResolvedValue(true),
};
jest.mock("../../../../backend/src/Nodejs/auth/Role_assignment", () => mockRoleAssignment);

jest.mock("../../../../backend/src/Nodejs/auth/regProvisioningRoute", () => {
  const localExpress = require("express");
  const router = localExpress.Router();
  router.get("/", (req, res) => res.status(200).json({ ok: true }));
  return router;
});

const handshakeRouter = require("../../../../backend/src/Nodejs/auth/handshakes");
const { logSecurityEvent } = require("../../../../backend/src/Nodejs/utils/logSecurityEvent");

describe("Consent Handshake & OTP Router Endpoints", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();


    process.env.BACKEND_HOSTNAME = "https://api.test";
    process.env.FRONTEND_HOST = "https://app.test";
    process.env.KC_HOST_FULL = "https://keycloak.test";
    process.env.KEYCLOAK_REALM = "test-realm";
    process.env.KC_CLIENT_ID = "test-client";
    process.env.KC_CLIENT_SECRET = "test-secret";

    app = express();
    app.use(express.json());
    app.use("/handshake", handshakeRouter);

    mockRequireApiAuth.mockImplementation((req, res, next) => {
      req.jwt = { sub: "patient-123" };
      next();
    });
    mockResolveRequesterType.mockReturnValue("practitioner");
  });

  test("HANDSHAKE-001: /request-otp clears old OTP records and generates a new token", async () => {
    const res = await supertest(app).post("/handshake/request-otp");

    expect(res.statusCode).toBe(200);
    expect(res.body.otp).toBe("654321");
    expect(mockHandshakeStorage.clearExistingOtp).toHaveBeenCalledWith("patient-123");
    expect(mockHandshakeStorage.createUniqueOtp).toHaveBeenCalledWith("patient-123");
  });

  test("HANDSHAKE-002: /request-otp returns 500 when storage operation faults out", async () => {
    mockHandshakeStorage.createUniqueOtp.mockRejectedValueOnce(new Error("Redis Out of Memory"));

    const res = await supertest(app).post("/handshake/request-otp");

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("OTP request failed");
    expect(res.body.detail).toBe("Redis Out of Memory");
  });

  test("HANDSHAKE-003: /verify-practitioner-otp processes practitioner request and emits push notification", async () => {
    mockRequireApiAuth.mockImplementationOnce((req, res, next) => {
      req.jwt = { sub: "practitioner-456" };
      next();
    });
    mockResolveRequesterType.mockReturnValueOnce("practitioner");
    mockHandshakeStorage.ClearVerifiedOtp.mockResolvedValueOnce("patient-123");

    const res = await supertest(app)
      .post("/handshake/verify-practitioner-otp")
      .send({ otp: "654321" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain("OTP verified. Waiting for patient approval.");
    expect(res.body.targetpatientId).toBe("patient-123");
    expect(mockHandshakeStorage.savePendingGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "patient-123",
        requesterId: "practitioner-456",
        requesterType: "practitioner",
      })
    );
  });

  test("HANDSHAKE-004: /verify-practitioner-otp rejects when body parameters are missing", async () => {
    const res = await supertest(app).post("/handshake/verify-practitioner-otp").send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("otp is required");
  });

  test("HANDSHAKE-005: /verify-practitioner-otp responds 401 when token is invalid or expired", async () => {
    mockHandshakeStorage.ClearVerifiedOtp.mockResolvedValueOnce(null);

    const res = await supertest(app)
      .post("/handshake/verify-practitioner-otp")
      .send({ otp: "000000" });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Invalid or expired OTP");
  });

  test("HANDSHAKE-006: /verify-caregiver-otp flags role context as 'caregiver_onboarding' if actor has a different active group identity", async () => {
    mockRequireApiAuth.mockImplementationOnce((req, res, next) => {
      req.jwt = { sub: "new-user-789" };
      next();
    });
    mockResolveRequesterType.mockReturnValueOnce("patient"); // Not a caregiver yet
    mockHandshakeStorage.ClearVerifiedOtp.mockResolvedValueOnce("patient-123");

    const res = await supertest(app)
      .post("/handshake/verify-caregiver-otp")
      .send({ otp: "654321" });

    expect(res.statusCode).toBe(200);
    expect(mockHandshakeStorage.savePendingGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        caregiverRoleAssignment: "caregiver_onboarding",
      })
    );
  });

  test("HANDSHAKE-007: /create-grant processes consensus approval and applies Keycloak grouping extensions during onboarding", async () => {
    const pendingRequestPayload = {
      handshakeId: "hs-uuid-000",
      patientId: "patient-123",
      requesterId: "caregiver-789",
      requesterType: "patient",
      caregiverRoleAssignment: "caregiver_onboarding",
    };
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(JSON.stringify(pendingRequestPayload));

    const res = await supertest(app)
      .post("/handshake/create-grant")
      .send({ handshakeId: "hs-uuid-000", approved: true, durationMinutes: 60, scopes: ["read", "write"] });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Consent granted");
    expect(mockGrantStorage.saveGrant).toHaveBeenCalled();
    expect(mockRoleAssignment.addUserToGroup).toHaveBeenCalledWith("caregiver-789", "Caregiver");
    expect(mockGrantStorage.setCaregiverMappings).toHaveBeenCalledWith("caregiver-789", "patient-123");
  });

  test("HANDSHAKE-008: /create-grant purges entries and logs a security exception if an alternate patient signs the transaction", async () => {
    const pendingRequestPayload = {
      handshakeId: "hs-uuid-000",
      patientId: "patient-A",
      requesterId: "practitioner-789",
    };
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(JSON.stringify(pendingRequestPayload));

    const res = await supertest(app)
      .post("/handshake/create-grant")
      .send({ handshakeId: "hs-uuid-000", approved: true, durationMinutes: 30 });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain("Forbidden: pending request does not belong to this patient");
    expect(logSecurityEvent).toHaveBeenCalledWith(
      "access",
      "GRANT_ACCESS_DENIED",
      expect.anything(),
      expect.objectContaining({ reason: "Forbidden: pending request does not belong to this patient" })
    );
  });

  test("HANDSHAKE-009: /create-grant routes requests down rejection branches safely when access is denied by patient", async () => {
    const pendingRequestPayload = {
      handshakeId: "hs-uuid-000",
      patientId: "patient-123",
      requesterId: "practitioner-789",
    };
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(JSON.stringify(pendingRequestPayload));

    const res = await supertest(app)
      .post("/handshake/create-grant")
      .send({ handshakeId: "hs-uuid-000", approved: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Patient denied access request");
    expect(mockHandshakeStorage.deletePendingGrant).toHaveBeenCalledWith("hs-uuid-000", "patient-123");
  });

  test("HANDSHAKE-010: /create-grant validates minimum authorization lifespan", async () => {
    const pendingRequestPayload = {
      handshakeId: "hs-uuid-000",
      patientId: "patient-123",
      requesterId: "practitioner-789",
    };
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(JSON.stringify(pendingRequestPayload));

    const res = await supertest(app)
      .post("/handshake/create-grant")
      .send({ handshakeId: "hs-uuid-000", approved: true, durationMinutes: 0 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Duration must be greater than 1");
  });

  test("HANDSHAKE-011: /pending yields current active requests array and clears out expired references", async () => {
    mockHandshakeStorage.listPendingHandshakes.mockResolvedValueOnce(["hs-valid", "hs-expired"]);
    mockHandshakeStorage.getPendingGrant.mockImplementation((id) => {
      if (id === "hs-valid") return Promise.resolve(JSON.stringify({ handshakeId: "hs-valid", detail: "data" }));
      return Promise.resolve(null); // expired record
    });

    const res = await supertest(app).get("/handshake/pending");

    expect(res.statusCode).toBe(200);
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.pending[0].handshakeId).toBe("hs-valid");
    expect(mockHandshakeStorage.deletePendingGrant).toHaveBeenCalledWith("hs-expired", "patient-123");
  });

  test("HANDSHAKE-012: /status/:handshakeId reports pending state if handshake is present in intermediate registries", async () => {
    mockRequireApiAuth.mockImplementationOnce((req, res, next) => {
      req.jwt = { sub: "requester-888" };
      next();
    });
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(
      JSON.stringify({ handshakeId: "hs-123", requesterId: "requester-888" })
    );

    const res = await supertest(app).get("/handshake/status/hs-123");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("pending");
  });

  test("HANDSHAKE-013: /status/:handshakeId falls back to check full grant engine when intermediate token state has finished tracking", async () => {
    mockRequireApiAuth.mockImplementationOnce((req, res, next) => {
      req.jwt = { sub: "requester-888" };
      next();
    });
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(null); // Gone from pending cache
    
    const targetExpiry = new Date(Date.now() + 60000).toISOString();
    mockGrantStorage.getGrantByRequesterAndPatient.mockResolvedValueOnce({
      grantId: "g-999",
      expiresAt: targetExpiry,
    });

    const res = await supertest(app).get("/handshake/status/hs-123?patientId=patient-123");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.grant.grantId).toBe("g-999");
  });

  test("HANDSHAKE-014: /status/:handshakeId fields 403 blocks when requester profile references alternate identities", async () => {
    mockRequireApiAuth.mockImplementationOnce((req, res, next) => {
      req.jwt = { sub: "intruder-999" };
      next();
    });
    mockHandshakeStorage.getPendingGrant.mockResolvedValueOnce(
      JSON.stringify({ handshakeId: "hs-123", requesterId: "legit-practitioner" })
    );

    const res = await supertest(app).get("/handshake/status/hs-123");

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});