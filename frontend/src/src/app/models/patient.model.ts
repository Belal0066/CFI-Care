// DTO for patient list view (transformed by backend)
export interface PatientSummaryDTO {
  id: string;
  name: string;
  age: number | null;
  lastUpdated: string; // ISO string
}

// DTO for patient details (transformed by backend or raw FHIR)
export interface PatientDetailsDTO {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  lastUpdated: string;

  primaryDiagnosis?: string;
  activeConditions?: string[];
  currentMedications?: string[];
  recentLabResults?: string[];
  recentProcedures?: string[];
}

// Raw FHIR Patient resource type (for direct FHIR responses)
export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
  };
  name?: Array<{
    use?: string;
    family?: string;
    given?: string[];
  }>;
  gender?: string;
  birthDate?: string;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
  address?: Array<{
    use?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}

// Helper to transform FHIR Patient to PatientDetailsDTO
export function fhirPatientToDetailsDTO(
  patient: FHIRPatient,
): PatientDetailsDTO {
  const name = patient.name?.[0];
  const fullName = name
    ? `${name.given?.join(' ') || ''} ${name.family || ''}`.trim()
    : 'Unknown';

  let age: number | null = null;
  if (patient.birthDate) {
    const birthDate = new Date(patient.birthDate);
    const today = new Date();
    age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
  }

  return {
    id: patient.id,
    name: fullName,
    age: age,
    gender: patient.gender || 'unknown',
    lastUpdated: patient.meta?.lastUpdated || new Date().toISOString(),
    primaryDiagnosis: '',
    activeConditions: [],
    currentMedications: [],
    recentLabResults: [],
    recentProcedures: [],
  };
}

// FHIR Condition resource type
export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  verificationStatus?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  category?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  }>;
  code?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  subject?: {
    reference?: string;
  };
  onsetDateTime?: string;
  recordedDate?: string;
}

// FHIR Encounter resource type
export interface FHIREncounter {
  resourceType: 'Encounter';
  id: string;
  status?: string;
  class?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  }>;
  type?: Array<{
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  reason?: Array<{
    value?: Array<{
      concept?: {
        coding?: Array<{
          system?: string;
          code?: string;
          display?: string;
        }>;
        text?: string;
      };
    }>;
  }>;
  subject?: {
    reference?: string;
  };
  actualPeriod?: {
    start?: string;
    end?: string;
  };
  diagnosis?: Array<{
    condition?: Array<{
      reference?: {
        reference?: string;
      };
      concept?: {
        coding?: Array<{
          system?: string;
          code?: string;
          display?: string;
        }>;
        text?: string;
      };
    }>;
    use?: Array<{
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
    }>;
  }>;
}

// FHIR MedicationRequest resource type
export interface FHIRMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status?: string;
  intent?: string;
  medication?: {
    concept?: {
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
      text?: string;
    };
    reference?: {
      reference?: string;
      display?: string;
    };
  };
  medicationCodeableConcept?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  medicationReference?: {
    reference?: string;
    display?: string;
  };
  subject?: {
    reference?: string;
  };
  authoredOn?: string;
  requester?: {
    reference?: string;
    display?: string;
  };
  dosageInstruction?: Array<{
    text?: string;
    timing?: {
      repeat?: {
        frequency?: number;
        period?: number;
        periodUnit?: string;
      };
    };
    route?: {
      coding?: Array<{
        display?: string;
      }>;
    };
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number;
        unit?: string;
      };
    }>;
  }>;
}

// FHIR Procedure resource type
export interface FHIRProcedure {
  resourceType: 'Procedure';
  id: string;
  status?: string;
  code?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  subject?: {
    reference?: string;
  };
  performedDateTime?: string;
  performedPeriod?: {
    start?: string;
    end?: string;
  };
  encounter?: {
    reference?: string;
  };
}

// Helper to extract display text from a FHIR Condition
export function extractConditionDisplay(condition: FHIRCondition): string {
  // Try to get the display text from code.text first, then code.coding[0].display
  if (condition.code?.text) {
    return condition.code.text;
  }
  if (condition.code?.coding && condition.code.coding.length > 0) {
    return (
      condition.code.coding[0].display ||
      condition.code.coding[0].code ||
      'Unknown Condition'
    );
  }
  return 'Unknown Condition';
}

// Helper to extract info from a FHIR Encounter
export function extractEncounterInfo(encounter: FHIREncounter): {
  type: string;
  reason: string;
  date: string;
  status: string;
} {
  // Get encounter type
  let type = '';
  if (encounter.type && encounter.type.length > 0) {
    type =
      encounter.type[0].text ||
      encounter.type[0].coding?.[0]?.display ||
      encounter.type[0].coding?.[0]?.code ||
      '';
  }

  // Get reason
  let reason = '';
  if (encounter.reason && encounter.reason.length > 0) {
    const firstReason = encounter.reason[0]?.value?.[0]?.concept;
    reason = firstReason?.text || firstReason?.coding?.[0]?.display || '';
  }

  // Get date
  const date = encounter.actualPeriod?.start
    ? new Date(encounter.actualPeriod.start).toLocaleDateString()
    : '';

  return {
    type,
    reason: reason || type,
    date,
    status: encounter.status || '',
  };
}

// Helper to extract display text from a FHIR MedicationRequest
export function extractMedicationDisplay(
  medicationRequest: FHIRMedicationRequest,
): string {
  // FHIR R5 uses medication.concept
  if (medicationRequest.medication?.concept) {
    if (medicationRequest.medication.concept.text) {
      return medicationRequest.medication.concept.text;
    }
    if (
      medicationRequest.medication.concept.coding &&
      medicationRequest.medication.concept.coding.length > 0
    ) {
      return (
        medicationRequest.medication.concept.coding[0].display ||
        medicationRequest.medication.concept.coding[0].code ||
        'Unknown Medication'
      );
    }
  }

  // Fallback to medication.reference
  if (medicationRequest.medication?.reference?.display) {
    return medicationRequest.medication.reference.display;
  }

  // Try medicationCodeableConcept (older FHIR versions)
  if (medicationRequest.medicationCodeableConcept) {
    if (medicationRequest.medicationCodeableConcept.text) {
      return medicationRequest.medicationCodeableConcept.text;
    }
    if (
      medicationRequest.medicationCodeableConcept.coding &&
      medicationRequest.medicationCodeableConcept.coding.length > 0
    ) {
      return (
        medicationRequest.medicationCodeableConcept.coding[0].display ||
        medicationRequest.medicationCodeableConcept.coding[0].code ||
        'Unknown Medication'
      );
    }
  }

  // Try medicationReference (older FHIR versions)
  if (medicationRequest.medicationReference?.display) {
    return medicationRequest.medicationReference.display;
  }

  return 'Unknown Medication';
}

// Helper to extract display text and date from a FHIR Procedure
export function extractProcedureDisplay(procedure: FHIRProcedure): string {
  // Get procedure name
  let procedureName = 'Unknown Procedure';
  if (procedure.code?.text) {
    procedureName = procedure.code.text;
  } else if (procedure.code?.coding && procedure.code.coding.length > 0) {
    procedureName =
      procedure.code.coding[0].display ||
      procedure.code.coding[0].code ||
      'Unknown Procedure';
  }

  // Get procedure date
  let date = '';
  if (procedure.performedDateTime) {
    date = new Date(procedure.performedDateTime).toLocaleDateString();
  } else if (procedure.performedPeriod?.start) {
    date = new Date(procedure.performedPeriod.start).toLocaleDateString();
  }

  return date ? `${procedureName} (${date})` : procedureName;
}
