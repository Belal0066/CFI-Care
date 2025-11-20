require("dotenv").config();

const express = require("express");
const cors = require("cors");


//pateint , auth
const patientRoutes = require("./routes/patientRoutes")

const authRoutes = require("./routes/authRoutes")

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
