require("dotenv").config();

const express = require("express");
const cors = require("cors");

const session = require("express-session")

//redis
// const redisConnect = require('connect-redis')
// const {Store} = redisConnect.RedisStore;
const { RedisStore } = require('connect-redis');
const redisClient = require('./utils/redisCli')
let store;
try {
  store = new RedisStore({ client: redisClient });
} catch (error) {
  console.error('RedisStore creation error', error);
}


//pateint , auth
const patientRoutes = require("./routes/patientRoutes")

const authRoutes = require("./routes/authRoutes")

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(session({
  store: store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    //ne8yro 3and prod
    secure: false,
    maxAge: 24 * 60 * 60 * 1000

  }
}));

app.use("/auth", authRoutes);

app.use("/api/patients", patientRoutes);



app.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT} , Process ID: ${process.pid}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});
