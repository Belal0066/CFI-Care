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
  patient: FHIRPatient
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
  };
}
