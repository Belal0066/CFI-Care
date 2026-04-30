
export interface PatientSummaryDTO {
  id: number;
  name: string;
  age: number;
  lastUpdated: string; // ISO string
}




// export interface PatientDetailsDTO {
//   id: number;
//   name: string;
//   age: number;
//   gender: string;
//   lastUpdated: string;

//   // episodes: Episode[];

//   primaryDiagnosis: string;
//   activeConditions: string[];
//   currentMedications: string[];
//   recentLabResults: string[];
//   recentProcedures: string[];
// }


export interface Episode {
  id: number;
  label: string;
  date: string;
  primaryDiagnosis: string;
  activeConditions: string[];
  currentMedications: string[];
  recentLabResults: string[];
  recentProcedures: string[];
}

export interface PatientDetailsDTO {
  id: number;
  name: string;
  age: number;
  gender: string;
  lastUpdated: string;
  episodes: Episode[];
}