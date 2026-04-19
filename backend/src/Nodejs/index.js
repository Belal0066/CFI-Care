require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
const helmet = require("helmet");
// const cookieParser = require('cookie-parser');

const pagesDirectory = __dirname + "/TestPages/";

//pateint , auth
const patientRoutes = require("./patient/patientRoutes");
const practitonerRoutes = require("./practioner/practionerRoutes");
const eocRoutes = require("./episodeOfCare/eocRoutes");
const conditionRoutes = require("./condition/conditionRoutes");
const binaryRoutes = require("./binary/binaryRoutes");
const encounterRoutes = require("./encounter/encounterRoutes");
const historyGraphRoutes = require("./historyGraph/historyGraphRoutes");
const medicationRequestRoutes = require("./medicationRequest/medicationRequestRoutes");
const procedureRoutes = require("./procedure/procedureRoutes");
const appointmentRoutes = require("./appointment/appointmentRoutes");
const allergyIntoleranceRoutes = require("./allergyIntolerance/allergyIntoleranceRoutes");
const observationRoutes = require("./observation/observationRoutes");
const scheduleRoutes = require("./schedule/scheduleRoutes");
const slotRoutes = require("./slot/slotRoutes");
const documentReferenceRoutes = require("./documentReference/documentReferenceRoutes");
const diagnosticReportRoutes = require("./diagnosticReport/diagnosticReportRoutes");
const imagingStudyRoutes = require("./imagingStudy/imagingStudyRoutes");
const organizationRoutes = require("./organization/organizationRoutes");
const locationRoutes = require("./location/locationRoutes");
const practitionerRoleRoutes = require("./practitionerRole/practitionerRoleRoutes");
const immunizationRoutes = require("./immunization/immunizationRoutes");
const healthcareServiceRoutes = require("./healthcareService/healthcareServiceRoutes");
const deviceRoutes = require("./device/deviceRoutes");
const relatedPersonRoutes = require("./relatedPerson/relatedPersonRoutes");

const authRoutes = require("./auth/authRoutes");
const { requireApiAuth } = require("./middleware/requireApiAuth");

const session = require("express-session");

const redisClient = require("./utils/redisCli");
const { RedisStore } = require("connect-redis");
const store = new RedisStore({
  client: redisClient,
  prefix: "sess:",
});

const { generalLimiter } = require("./middleware/rateLimiter");

const app = express();
const PORT = process.env.PORT || 3000;
const BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || "60mb";

app.set("trust proxy", 1);

// CORS configuration for Angular frontend
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "https://localhost", // 5aleto https , w mn 8er port 3ashan y route thorugh nginx bas keda keda 3andoko cors_origin defined f env men 8ero fa mat8yrhosh l da law msh bt run-o el containers   //["http://localhost:4200", "https://localhost"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
// app.use(express.json());

app.use(
  express.json({
    type: ["application/json", "application/fhir+json"],
    limit: BODY_SIZE_LIMIT,
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: BODY_SIZE_LIMIT,
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);

// app.use(cors());

// app.use(express.json({ type: ['application/json', 'application/fhir+json'] }));

//timing middleware
// app.use((req, res, next) => {
//   try {
//     req._id =
//       typeof randomUUID === "function"
//         ? randomUUID()
//         : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
//   } catch (e) {
//     req._id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
//   }
//   res.setHeader("X-Request-Id", req._id);
//   req._startHrTime = process.hrtime.bigint();
//   res.on("finish", () => {
//     try {
//       const ms = Number(process.hrtime.bigint() - req._startHrTime) / 1e6;
//       console.log(
//         `[req ${req._id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(2)}ms`,
//       );
//     } catch (err) {
//       console.log(`[req ${req._id}] completed (timing failed)`);
//     }
//   });
//   next();
// });

app.use(
  session({
    store: store, //new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", //for now because dev , frontend doesn't use ssl :/
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 hr
      // domain: process.env.COOKIE_DOMAIN || undefined, //lel cloud odam?
    },
  }),
);

// logging for /api/patients (after session middleware so cookies are parsed)
// app.use((req, res, next) => {
//   if (req.path.includes('/api/patients')) {
//     console.log('[DEBUG] /api/patients incoming:', {
//       path: req.path,
//       method: req.method,
//       cookies: req.headers.cookie,
//       sessionID: req.sessionID,
//       hasSession: !!req.session,
//       hasUser: !!req.session?.user,
//       hasTokens: !!req.session?.tokens
//     });
//   }
//   next();
// });

app.post("/timing", (req, res) => {
  try {
    const body = req.body || {};
    console.log(`[timing] client event:`, JSON.stringify(body));
  } catch (err) {
    console.warn("Failed to log timing event", err && err.message);
  }
  return res.sendStatus(204);
});

// app.use(cookieParser());

// Apply general rate limiting to all routes
app.use(generalLimiter);

app.use("/auth", authRoutes);

app.use("/api", requireApiAuth);

app.use("/api/medicationRequests", medicationRequestRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/practitioners", practitonerRoutes);
app.use("/api/episodeOfCare", eocRoutes);
app.use("/api/conditions", conditionRoutes);
app.use("/api/binary", binaryRoutes);
app.use("/api/encounters", encounterRoutes);
app.use("/api/procedures", procedureRoutes);
app.use("/api/historyGraph", historyGraphRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/allergies", allergyIntoleranceRoutes);
app.use("/api/observations", observationRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/documentReferences", documentReferenceRoutes);
app.use("/api/diagnosticReports", diagnosticReportRoutes);
app.use("/api/imagingStudies", imagingStudyRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/practitionerRoles", practitionerRoleRoutes);
app.use("/api/immunizations", immunizationRoutes);
app.use("/api/healthcareServices", healthcareServiceRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/relatedPersons", relatedPersonRoutes);

// //log all requests that reach here
// app.use((req, res, next) => {
//   console.log('[index.js] Request reached fallback:', req.method, req.path);
//   res.status(404).json({ error: 'Route not found' });
// });

app.get("/CreatePatient", (req, res) => {
  res.sendFile(pagesDirectory + "createPatient.html");
});

app.get("/GetPatient", (req, res) => {
  res.send("GetPatient endpoint is under construction.");
});
app.get("/CreatePractitioner", (req, res) => {
  res.sendFile(pagesDirectory + "createPractitioner.html");
});

app.get("/EOC", (req, res) => {
  res.sendFile(pagesDirectory + "EpisodeOfCare.html");
});

if (process.env.NODE_ENV !== "test") {
  app.get;
  app.listen(PORT, () => {
    console.log(
      `Node.js server listening on port ${PORT} , Process ID: ${process.pid}`,
    );
    console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
  });
} else {
  console.log("Test environment so no server -_-");
}

module.exports = app;
