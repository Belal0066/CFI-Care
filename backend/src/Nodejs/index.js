require("dotenv").config();

const express = require("express");
const cors = require("cors");

const patientRoutes = require("./patient/patientRoutes");
const practitonerRoutes = require("./practioner/practionerRouter");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/patients", patientRoutes);
app.use("/api/practitioners", practitonerRoutes);

app.get("/CreatePatient", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Full FHIR Patient Registration</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f4f4f9; }
          h1 { text-align: center; color: #333; }
          fieldset { background: #fff; border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          legend { background-color: #4CAF50; color: white; padding: 5px 10px; border-radius: 3px; font-weight: bold; }
          .form-row { display: flex; gap: 15px; margin-bottom: 10px; }
          .form-group { flex: 1; }
          label { display: block; margin-bottom: 5px; font-weight: 500; font-size: 0.9em; }
          input, select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
          button { background-color: #2196F3; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 1.1em; }
          button:hover { background-color: #0b7dda; }
          .id-field { border: 2px solid #2196F3; background-color: #e3f2fd; }
        </style>
      </head>
      <body>
        <h1>Create FHIR Patient (PUT)</h1>
        <form id="fhirForm">
          
          <fieldset>
            <legend>Resource Identification</legend>
            <div class="form-group">
                <label style="color:#0b7dda; font-weight:bold;">Desired Resource ID (Required):</label>
                <input type="text" id="resourceId" class="id-field" placeholder="e.g. patient-john-doe-123" required>
                <small style="color:gray;">This will set the ID in the database URL.</small>
            </div>
          </fieldset>

          <fieldset>
            <legend>Basic Identity</legend>
            <div class="form-row">
              <div class="form-group">
                <label>First Name (Given):</label>
                <input type="text" id="givenName" required>
              </div>
              <div class="form-group">
                <label>Last Name (Family):</label>
                <input type="text" id="familyName" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Identifier Value (SSN/ID):</label>
                <input type="text" id="identifierValue">
              </div>
               <div class="form-group">
                <label>Active Record:</label>
                <select id="active">
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Demographics</legend>
            <div class="form-row">
              <div class="form-group">
                <label>Gender:</label>
                <select id="gender">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div class="form-group">
                <label>Birth Date:</label>
                <input type="date" id="birthDate" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Marital Status:</label>
                <select id="maritalStatus">
                  <option value="U">Unmarried</option>
                  <option value="M">Married</option>
                  <option value="D">Divorced</option>
                  <option value="W">Widowed</option>
                </select>
              </div>
              <div class="form-group">
                <label>Deceased?</label>
                <select id="isDeceased" onchange="toggleDeceasedDate()">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
              <div class="form-group" id="deceasedDateGroup" style="display:none;">
                <label>Deceased Date:</label>
                <input type="datetime-local" id="deceasedDateTime">
              </div>
            </div>
            <div class="form-row">
               <div class="form-group">
                <label>Multiple Birth (Twin/Triplet)?</label>
                <select id="multipleBirth">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Contact Details</legend>
            <div class="form-row">
              <div class="form-group">
                <label>Phone:</label>
                <input type="tel" id="phone">
              </div>
              <div class="form-group">
                <label>Email:</label>
                <input type="email" id="email">
              </div>
            </div>
            <div class="form-row">
               <div class="form-group">
                <label>Preferred Language:</label>
                <input type="text" id="language" placeholder="en-US">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Address</legend>
            <div class="form-group">
              <label>Street Address:</label>
              <input type="text" id="addrLine">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>City:</label>
                <input type="text" id="addrCity">
              </div>
              <div class="form-group">
                <label>State:</label>
                <input type="text" id="addrState">
              </div>
              <div class="form-group">
                <label>Postal Code:</label>
                <input type="text" id="addrZip">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Emergency Contact / Next of Kin</legend>
            <div class="form-row">
              <div class="form-group">
                <label>Contact Name:</label>
                <input type="text" id="contactName">
              </div>
              <div class="form-group">
                <label>Relationship (e.g., Partner):</label>
                <input type="text" id="contactRel">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Contact Phone:</label>
                <input type="tel" id="contactPhone">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Administrative</legend>
            <div class="form-row">
              <div class="form-group">
                <label>General Practitioner (Reference):</label>
                <input type="text" id="gpRef" placeholder="Practitioner/123">
              </div>
              <div class="form-group">
                <label>Managing Org (Reference):</label>
                <input type="text" id="orgRef" placeholder="Organization/555">
              </div>
            </div>
          </fieldset>

          <button type="submit">Create Patient Resource (PUT)</button>
        </form>

        <script>
          function toggleDeceasedDate() {
            const isDeceased = document.getElementById('isDeceased').value === 'true';
            document.getElementById('deceasedDateGroup').style.display = isDeceased ? 'block' : 'none';
          }

          document.getElementById('fhirForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const logicalId = document.getElementById('resourceId').value;
            
            if(!logicalId) {
                alert("Please enter a Resource ID");
                return;
            }

            const fhirPatient = {
              "resourceType": "Patient",
              "id": logicalId, // Must match the ID in the URL
              "active": document.getElementById('active').value === 'true',
              
              "name": [{
                "use": "official",
                "family": document.getElementById('familyName').value,
                "given": [document.getElementById('givenName').value]
              }],

              "identifier": [{
                "system": "http://hospital.org/ids",
                "value": document.getElementById('identifierValue').value
              }],

              "telecom": [],

              "gender": document.getElementById('gender').value,
              "birthDate": document.getElementById('birthDate').value,
              
              "address": [{
                "line": [document.getElementById('addrLine').value],
                "city": document.getElementById('addrCity').value,
                "state": document.getElementById('addrState').value,
                "postalCode": document.getElementById('addrZip').value
              }],

              "maritalStatus": {
                "coding": [{
                  "system": "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
                  "code": document.getElementById('maritalStatus').value
                }]
              },

              "multipleBirthBoolean": document.getElementById('multipleBirth').value === 'true',

              "contact": [{
                "relationship": [{
                  "text": document.getElementById('contactRel').value
                }],
                "name": {
                  "text": document.getElementById('contactName').value
                },
                "telecom": [{
                  "system": "phone",
                  "value": document.getElementById('contactPhone').value
                }]
              }]
            };

            
            if(document.getElementById('isDeceased').value === 'true') {
               const dateVal = document.getElementById('deceasedDateTime').value;
               if(dateVal) {
                 fhirPatient.deceasedDateTime = dateVal;
               } else {
                 fhirPatient.deceasedBoolean = true;
               }
            } else {
              fhirPatient.deceasedBoolean = false;
            }

            const phone = document.getElementById('phone').value;
            const email = document.getElementById('email').value;
            if(phone) fhirPatient.telecom.push({ "system": "phone", "value": phone, "use": "mobile" });
            if(email) fhirPatient.telecom.push({ "system": "email", "value": email, "use": "home" });

            const lang = document.getElementById('language').value;
            if(lang) {
              fhirPatient.communication = [{
                "language": {
                  "coding": [{ "system": "urn:ietf:bcp:47", "code": lang }]
                },
                "preferred": true
              }];
            }

            const gp = document.getElementById('gpRef').value;
            if(gp) fhirPatient.generalPractitioner = [{ "reference": gp }];
            
            const org = document.getElementById('orgRef').value;
            if(org) fhirPatient.managingOrganization = { "reference": org };

            try {
              // Construct URL: /api/patients/ID
              const url = '/api/patients/' + logicalId;

              const response = await fetch(url, {
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fhirPatient)
              });

              if (response.ok) {
                alert('FHIR Patient Created/Updated Successfully with ID: ' + logicalId);
                console.log(await response.json());
              } else {
                const txt = await response.text();
                alert('Error: ' + txt);
              }
            } catch (err) {
              console.error(err);
              alert('Network error');
            }
          });
        </script>
      </body>
    </html>
  `);
});

app.get("/GetPatient", (req, res) => {
  res.send("GetPatient endpoint is under construction.");
});

app.get("/Practitioner", (req, res) => {
  res.send("Practitioner endpoint is under construction.");
});

app.get;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Connecting to FHIR server at ${process.env.FHIR_SERVER_URL}`);
});
