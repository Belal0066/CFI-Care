const express = require("express");
const supertest = require("supertest");
// const axios = require("axios");

// jest.mock("axios");

process.env.KC_HOST_FULL = "https://keycloak.test";
process.env.KEYCLOAK_REALM = "test-realm";
process.env.KC_REALM = "test-realm";
process.env.KC_CLIENT_ID = "test-client";
process.env.CLIENT_ID = "test-client";
process.env.KC_CLIENT_SECRET = "test-secret";
process.env.BACKEND_HOSTNAME = "https://api.test";
process.env.FRONTEND_HOST = "https://app.test";
process.env.OAUTH2_PROXY_SIGNOUT_URL = "https://proxy.test/signout";
process.env.BROWSER_CLIENT_ID = "browser-client";
process.env.KC_HOSTNAME_INTERNAL = "http://127.0.0.1:8080";

const mockAxios = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
};
mockAxios.create.mockReturnValue(mockAxios);

const axios = mockAxios;
jest.mock("../../../../backend/src/Nodejs/node_modules/axios", () => mockAxios);

jest.mock("../../../../backend/src/Nodejs/middleware/rateLimiter", () => ({
  loginLimiter: (req, res, next) => next(),
  registerLimiter: (req, res, next) => next(),
  logoutLimiter: (req, res, next) => next(),
  generalLimiter: (req, res, next) => next(),
}));

jest.mock("../../../../backend/src/Nodejs/middleware/requireApiAuth", () => ({
  requireApiAuth: jest.fn((req, res, next) => {
    req.user = { sub: "user-123", email: "user@example.com" };
    next();
  }),
}));

jest.mock("../../../../backend/src/Nodejs/utils/auditLog", () => ({
  logAuthEvent: jest.fn(),
}));

jest.mock("../../../../backend/src/Nodejs/utils/userSessions", () => ({
  addSessionForUser: jest.fn(),
  removeSessionForUser: jest.fn(),
  getSessionsForUser: jest.fn(() => ["sess-abc", "sess-xyz"]),
  clearAllSessionsForUser: jest.fn(),
  destroySessionById: jest.fn(),
}));

jest.mock("../../../../backend/src/Nodejs/redisClient.js", () => ({
  connect: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
}));

const authRouter = require("../../../../backend/src/Nodejs/auth/authRoutes");
const {
  requireApiAuth,
} = require("../../../../backend/src/Nodejs/middleware/requireApiAuth");
const {
  logAuthEvent,
} = require("../../../../backend/src/Nodejs/utils/auditLog");
const {
  addSessionForUser,
} = require("../../../../backend/src/Nodejs/utils/userSessions");

describe("Authentication Router Endpoints", () => {
  let app;
  let mockSession;

  //   beforeAll(() => {
  //     process.env.KC_HOST_FULL = "https://keycloak.test";
  //     process.env.KC_SERVER_URL = "https://keycloak.test/keycloak";
  //     process.env.KEYCLOAK_REALM = "test-realm";
  //     process.env.KC_REALM = "test-realm";
  //     process.env.KC_CLIENT_ID = "test-client";
  //     process.env.CLIENT_ID = "test-client";
  //     process.env.KC_CLIENT_SECRET = "test-secret";
  //     process.env.BACKEND_HOSTNAME = "https://api.test";
  //     process.env.FRONTEND_HOST = "https://app.test";
  //     process.env.OAUTH2_PROXY_SIGNOUT_URL = "https://proxy.test/signout";
  //     process.env.BROWSER_CLIENT_ID = "browser-client";
  //     process.env.KC_HOSTNAME_INTERNAL = "http://127.0.0.1:8080";
  //   });

  beforeEach(() => {
    jest.clearAllMocks();

    mockSession = {
      oauth_state: "state123",
      code_verifier: "verifier123",
      redirect_after_auth: "https://app.test/dashboard",
      user: { sub: "user-123", email: "user@example.com" },
      tokens: { access: "acc-token", refresh: "ref-token" },
      save: jest.fn((cb) => cb && cb()),
      destroy: jest.fn((cb) => cb && cb()),
    };

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.session = mockSession;
      req.sessionID = "mock-session-id-456";
      next();
    });

    app.use("/auth", authRouter);
  });

  test("AUTH-001: /start creates crypto PKCE state and redirects to Keycloak", async () => {
    const res = await supertest(app).get(
      "/auth/start?kc_action=UPDATE_PASSWORD",
    );

    expect(res.statusCode).toBe(302);
    expect(mockSession.code_verifier).toBeDefined();
    expect(mockSession.oauth_state).toBeDefined();

    const location = res.headers.location;
    expect(location).toContain(
      "https://keycloak.test/realms/test-realm/protocol/openid-connect/auth",
    );
    expect(location).toContain("response_type=code");
    expect(location).toContain("kc_action=UPDATE_PASSWORD");
  });

  test("AUTH-002: /callback handles Keycloak cancellations gracefully", async () => {
    const res = await supertest(app).get(
      "/auth/callback?kc_action_status=cancelled",
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://app.test/dashboard");
  });

  test("AUTH-003: /callback rejects request if state param mismatches session", async () => {
    const res = await supertest(app).get(
      "/auth/callback?code=123&state=wrong_state",
    );

    expect(res.statusCode).toBe(400);
    expect(res.text).toBe("Invalid state or code");
  });

  test("AUTH-004: /callback successfully exchanges code and fetches profile", async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        access_token: "valid-at",
        refresh_token: "valid-rt",
        id_token: "valid-it",
        expires_in: 300,
        refresh_expires_in: 1800,
      },
    });

    axios.get.mockResolvedValueOnce({
      data: {
        sub: "user-123",
        email: "user@example.com",
        name: "Test User",
      },
    });

    const res = await supertest(app).get(
      "/auth/callback?code=code123&state=state123",
    );

    expect(res.statusCode).toBe(302);
    expect(axios.post).toHaveBeenCalledWith(
      "https://keycloak.test/realms/test-realm/protocol/openid-connect/token",
      expect.any(String),
      expect.any(Object),
    );
    expect(mockSession.user.name).toBe("Test User");
  });

  test("AUTH-004-ERR: /callback handles Keycloak token exchange rejection gracefully", async () => {
    axios.post.mockRejectedValueOnce(new Error("Bad Verification Code"));

    const res = await supertest(app).get(
      "/auth/callback?code=badcode&state=state123",
    );

    expect(res.statusCode).toBe(401); 
    expect(res.text).toBe("auth failed :<");
  });

  test("AUTH-004-ERR2: /callback handles failure to fetch user profile", async () => {
    axios.post.mockResolvedValueOnce({ data: { access_token: "valid-at" } });
    axios.get.mockRejectedValueOnce(new Error("UserInfo Timeout"));

    const res = await supertest(app).get(
      "/auth/callback?code=code123&state=state123",
    );

    expect(res.statusCode).toBe(401); 
    expect(res.text).toBe("auth failed :<");
  });

  test("AUTH-005: /me returns current session user structure", async () => {
    const res = await supertest(app).get("/auth/me");

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      authenticated: true,
      user: { sub: "user-123", email: "user@example.com" },
    });
  });

  test("AUTH-006: /session-init maps session via utility storage and tracks context", async () => {
    const res = await supertest(app).get("/auth/session-init");

    expect(res.statusCode).toBe(200);
    expect(addSessionForUser).toHaveBeenCalledWith(
      "user-123",
      "mock-session-id-456",
    );
    expect(logAuthEvent).toHaveBeenCalledWith(
      "SESSION_CREATED",
      expect.anything(),
      {
        userId: "user-123",
        email: "user@example.com",
      },
    );
  });

  test("AUTH-007: /logout cleans node session context and builds dynamic proxy redirects", async () => {
    const res = await supertest(app)
      .get("/auth/logout")
      .set("x-auth-request-id-token", "Bearer mock-id-hint");

    expect(res.statusCode).toBe(302);
    expect(mockSession.destroy).toHaveBeenCalled();
    expect(res.headers.location).toContain("https://proxy.test/signout");
    expect(res.headers.location).toContain("id_token_hint%3Dmock-id-hint");
  });

  test("AUTH-008: /logout-all revokes user across all clusters and internal sessions", async () => {
    axios.post.mockImplementation((url) => {
      if (url.includes("/protocol/openid-connect/revoke"))
        return Promise.resolve({});
      if (url.includes("/protocol/openid-connect/token"))
        return Promise.resolve({ data: { access_token: "admin-at" } });
      if (url.includes("/logout")) return Promise.resolve({});
      return Promise.reject(new Error("Unknown call"));
    });

    const res = await supertest(app).post("/auth/logout-all");

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(logAuthEvent).toHaveBeenCalledWith(
      "LOGOUT_ALL",
      expect.anything(),
      expect.any(Object),
    );
  });
});
