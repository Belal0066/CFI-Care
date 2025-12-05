require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pagesDirectory = __dirname + "/TestPages/";

const patientRoutes = require("./patient/patientRoutes");
const practitonerRoutes = require("./practioner/practionerRoutes");
const eocRoutes = require("./episodeOfCare/eocRoutes");
const conditionRoutes = require("./condition/conditionRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/patients", patientRoutes);
app.use("/api/practitioners", practitonerRoutes);
app.use("/api/episodeOfCare", eocRoutes);
app.use("/api/conditions", conditionRoutes);

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

app.get;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});
