require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");
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

const authRoutes = require("./auth/authRoutes")
const session = require("express-session");

const redisClient = require("./utils/redisCli");
const {RedisStore} = require('connect-redis');       //.default;
const store = new RedisStore({ client: redisClient });

const app = express();
const PORT = process.env.PORT || 3000;



  app.set('trust proxy', 1); 


// CORS configuration for Angular frontend
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "https://localhost",  // 5aleto https , w mn 8er port 3ashan y route thorugh nginx bas keda keda 3andoko cors_origin defined f env men 8ero fa mat8yrhosh l da law msh bt run-o el containers   //["http://localhost:4200", "https://localhost"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// app.use(cors());

// app.use(express.json({ type: ['application/json', 'application/fhir+json'] }));


//timing middleware
app.use((req, res, next) => {
  try {
    req._id = (typeof randomUUID === 'function') ? randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  } catch (e) {
    req._id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }
  res.setHeader('X-Request-Id', req._id);
  req._startHrTime = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const ms = Number(process.hrtime.bigint() - req._startHrTime) / 1e6;
      console.log(`[req ${req._id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(2)}ms`);
    } catch (err) {
      console.log(`[req ${req._id}] completed (timing failed)`);
    }
  });
  next();
});

app.use(
      session({
            store:store,          //new RedisStore({ client: redisClient }),
            secret: process.env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                  secure: process.env.NODE_ENV === 'production', //for now because dev , frontend doesn't use ssl :/
                  httpOnly: true,
                  sameSite: 'lax',
                  maxAge: 60 * 60 * 1000, // 1 hr 
                  // domain: process.env.COOKIE_DOMAIN || undefined, //lel cloud odam?
            },
            // proxy: true, // Trust session cookies from proxy
      })
)

// const path = require('path');

// app.use(express.static(path.join(__dirname, '../../../security/Containers/static')));



// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, '../../../security/Containers/static', 'test-fetch-fhir-data.html'));
// });

//logging for auth :/
// app.use((req, res, next) => {
//   console.log(`[req ${req._id}] Incoming auth headers:`, {
//     authorization: req.headers.authorization,
//     x_access_token: req.headers['x-access-token'],
//   });
//   next();
// });

app.post('/timing', (req, res) => {
  try {
    const body = req.body || {};
    console.log(`[timing] client event:`, JSON.stringify(body));
  } catch (err) {
    console.warn('Failed to log timing event', err && err.message);
  }
  return res.sendStatus(204);
});

// app.use(cookieParser());
app.use("/auth", authRoutes);



app.use("/api/patients", patientRoutes);
app.use("/api/practitioners", practitonerRoutes);
app.use("/api/episodeOfCare", eocRoutes);
app.use("/api/conditions", conditionRoutes);
app.use("/api/binary", binaryRoutes);
app.use("/api/encounters", encounterRoutes);
app.use("/api/historyGraph", historyGraphRoutes);

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

if(process.env.NODE_ENV !== 'test') {
app.get;
app.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT} , Process ID: ${process.pid}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});

}
else {
  console.log('Test environment so no server -_-');
}

module.exports = app;
