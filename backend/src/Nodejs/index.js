require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { randomUUID } = require('crypto');


//pateint , auth
const patientRoutes = require("./patient/patientRoutes");

const authRoutes = require("./patient/authRoutes")

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

const path = require('path');

app.use(express.static(path.join(__dirname, '../../../security/Containers/static')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../security/Containers/static', 'test-fetch-patient.html'));
});

//logging for auth :/
app.use((req, res, next) => {
  console.log(`[req ${req._id}] Incoming auth headers:`, {
    authorization: req.headers.authorization,
    x_access_token: req.headers['x-access-token'],
    x_auth_request_access_token: req.headers['x-auth-request-access-token'],
  });
  next();
});

app.post('/timing', (req, res) => {
  try {
    const body = req.body || {};
    console.log(`[timing] client event:`, JSON.stringify(body));
  } catch (err) {
    console.warn('Failed to log timing event', err && err.message);
  }
  return res.sendStatus(204);
});


app.use("/auth", authRoutes);

app.use("/api/patients", patientRoutes);

if(process.env.NODE_ENV !== 'test') {

app.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT} , Process ID: ${process.pid}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});

}
else {
  console.log('Test environment so no server -_-');
}

module.exports = app;
