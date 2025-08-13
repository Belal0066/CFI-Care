
export enum EventType {
  DIAGNOSIS = 'Diagnosis',
  MEDICATION = 'Medication',
  PROCEDURE = 'Procedure',
  INVESTIGATION = 'Investigation',
  HPI = 'History of Present Illness',
  HOSPITALIZATION = 'Hospitalization',
  FOLLOW_UP = 'Follow-up',
  ADVERSE_EVENT = 'Adverse Event',
  SOCIAL_HISTORY = 'Social History',
  OBSERVATION = 'Observation',
}

export enum EventStatus {
  ACTIVE = 'Active',
  RESOLVED = 'Resolved',
  PLANNED = 'Planned',
  COMPLETED = 'Completed',
  CONFLICT = 'Conflict',
}

export interface DataConflict {
  id: string;
  field: 'allergies';
  key: string;
  existingValue: string;
  newValue: string;
  sources: {
    existing: string;
    new: string;
  };
  status: 'unresolved' | 'resolved';
}

export interface Patient {
  id: string;
  name: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string[];
  conflicts: DataConflict[];
  geneticConditions: string[];
  chronicMedications: string[];
  activeDevices: string[];
  maritalStatus: string;
  occupation: string;
  address: string;
  socialHistory: string[];
}

export interface EventNodeData {
  id: string;
  parentIds: string[];
  timestamp: Date;
  type: EventType;
  summary: string;
  details: string;
  author: string;
  status: EventStatus;
  specialty: string;
  isMajorEvent: boolean;
  diff?: {
    before: string;
    after: string;
  };
}

export interface MedicalEpisode {
    id: string;
    title: string;
    status: EventStatus;
    dateRange: string;
    events: EventNodeData[];
}

export interface VitalSignDataPoint {
  timestamp: Date;
  value: number;
}

export interface VitalSign {
  name: string;
  unit: string;
  data: VitalSignDataPoint[];
}

// --- New Types for Research Graph ---

export enum DependencyNodeType {
  SYMPTOM = 'Symptom',
  DIAGNOSIS = 'Diagnosis',
  INVESTIGATION = 'Investigation',
  TREATMENT = 'Treatment',
  OUTCOME = 'Outcome',
  SIDE_EFFECT = 'Side Effect',
  OPINION = 'Opinion',
  PHYSICAL_EXAM = 'Physical Exam',
}

export enum DependencyEdgeType {
  CAUSAL = 'Causal', // A causes B
  THERAPEUTIC = 'Therapeutic', // A treats B
  DIAGNOSTIC = 'Diagnostic', // A suggests/confirms B
  EXCLUSIONARY = 'Exclusionary', // A rules out B
  CORRELATIONAL = 'Correlational', // A and B are correlated
}

export interface DependencyCluster {
  id: string;
  label: string;
}

export interface DependencyNode {
  id: string;
  label: string;
  type: DependencyNodeType;
  author: string;
  timestamp: Date;
  details?: string;
  eventIds: string[]; // Link back to events in the timeline
  clusterId?: string;
}

export interface DependencyEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  type: DependencyEdgeType;
  author: string;
  timestamp: Date;
  isConflict?: boolean; // Highlight conflicting edges
  details?: string;
}

export interface DependencyGraphData {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  clusters: DependencyCluster[];
}
