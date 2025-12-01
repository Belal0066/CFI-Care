require("dotenv").config();

const express = require("express");
const cors = require("cors");

const patientRoutes = require("./patient/patientRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/patients", patientRoutes);

app.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});
