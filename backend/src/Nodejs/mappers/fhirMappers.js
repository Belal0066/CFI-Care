const fhirpath = require("fhirpath");

function transformPatient(resource) {
  return {
    id: resource.id,
    firstName: fhirpath.evaluate(
      resource,
      "Patient.name.where(use='official').given[0]"
    )[0],
    lastName: fhirpath.evaluate(
      resource,
      "Patient.name.where(use='official').family"
    )[0],
    email: fhirpath.evaluate(
      resource,
      "Patient.telecom.where(system='email').value"
    )[0],
    birthDate: resource.birthDate,
  };
}

function transformObservation(resource) {
  return {
    id: resource.id,
    name: fhirpath.evaluate(resource, "Observation.code.text")[0],
    status: resource.status,
    date: resource.issued,
    value: fhirpath.evaluate(resource, "Observation.valueQuantity.value")[0],
    unit: fhirpath.evaluate(resource, "Observation.valueQuantity.unit")[0],
  };
}

function transformEncounter(resource) {
  return {
    id: resource.id,
    status: resource.status,
    display: fhirpath.evaluate(resource, "Encounter.class.display")[0],
    reason: fhirpath.evaluate(resource, "Encounter.reasonCode.text")[0],
  };
}

module.exports = {
  transformPatient,
  transformObservation,
  transformEncounter,
};
