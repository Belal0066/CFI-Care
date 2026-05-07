import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PatientSummaryDTO, FHIRPatient } from '../../models/patient.model';

export interface GraphNodeData {
  id?: string;
  text_1: string;
  title?: string;
  category: string;
  priority: string;
  normality: string;
  dateIssued: string;
  details: string;
  isDiagnosis?: boolean;
  isManualBranch?: boolean;
  branchState?: string; 
  branchId?: string; 
}

export interface AddNodeRequest {
  patientId: string;
  eocId: string;
  nodeData: GraphNodeData;
  parentNodeId?: string;
}

export interface UpdateNodeRequest {
  patientId: string;
  nodeId: string;
  updatedData: Partial<GraphNodeData>;
  parentNodeId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PatientApiService {
  private baseUrl = '/api/patients';
  private graphUrl = '/api/historyGraph';
  private conditionsUrl = '/api/conditions';
  private medicationRequestsUrl = '/api/medicationRequests';

  constructor(private http: HttpClient) {}

  // Get list of patient summaries (for Users component)
  getPatients(): Observable<PatientSummaryDTO[]> {
    return this.http.get<PatientSummaryDTO[]>(this.baseUrl);
  }

  // Get raw FHIR Patient by ID (for UserInfo - needs transformation)
  getPatientById(id: string | number): Observable<FHIRPatient> {
    return this.http.get<FHIRPatient>(`${this.baseUrl}/${id}`);
  }

  // Get patient graph data from historyGraph endpoint
  getPatientGraph(id: string | number, eocId?: string): Observable<any> {
    const params: Record<string, string> = {};
    if (eocId) params['eocId'] = eocId;
    return this.http.get<any>(`${this.graphUrl}/${id}`, { params });
  }

  // Add a new node to patient graph
  addGraphNode(request: AddNodeRequest): Observable<any> {
    return this.http.post<any>(`${this.graphUrl}/addNode`, request);
  }

  // Update an existing node
  updateGraphNode(request: UpdateNodeRequest): Observable<any> {
    return this.http.put<any>(`${this.graphUrl}/updateNode`, request);
  }

  // Delete a node from patient graph
  deleteGraphNode(patientId: string, nodeId: string): Observable<any> {
    return this.http.delete<any>(`${this.graphUrl}/${patientId}/${nodeId}`);
  }

  // Get all related data for a patient
  getPatientRelatedData(id: string | number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/related-data`);
  }

  // Get patient observations
  getPatientObservations(id: string | number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/observations`);
  }

  // Get patient encounters
  getPatientEncounters(id: string | number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}/encounters`);
  }

  // Get patient conditions
  getPatientConditions(id: string | number): Observable<any> {
    return this.http.get<any>(`${this.conditionsUrl}/patient/${id}`);
  }

  // Get patient medication requests
  getPatientMedicationRequests(id: string | number): Observable<any> {
    return this.http.get<any>(`${this.medicationRequestsUrl}/patient/${id}`);
  }

  // Get patient procedures
  getPatientProcedures(id: string | number): Observable<any> {
    return this.http.get<any>(`/api/procedures/patient/${id}`);
  }

  // Get patient document references (uploaded documents)
  getPatientDocumentReferences(id: string | number): Observable<any> {
    return this.http.get<any>(`/api/documentReferences/patient/${id}`);
  }

  // Get all EpisodeOfCare resources for a patient
  getPatientEpisodesOfCare(patientId: string | number): Observable<any[]> {
    return this.http.get<any[]>(`/api/episodeOfCare/patient/${patientId}`);
  }

  // Get encounters linked to an EpisodeOfCare
  getEpisodeEncounters(eocId: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/episodeOfCare/${eocId}/encounters`);
  }

  // Create a new EpisodeOfCare (no graph root node created)
  createEpisodeOfCare(eocData: {
    id: string;
    status: string;
    patient: { reference: string };
    type?: Array<{ text: string }>;
    period?: { start: string };
  }): Observable<any> {
    return this.http.put<any>('/api/episodeOfCare', eocData);
  }

  // Fetch a FHIR Binary resource (returns JSON with base64 data field)
  getBinaryResource(binaryId: string): Observable<any> {
    return this.http.get<any>(`/api/binary/${binaryId}`);
  }

  // Create a new patient
  createPatient(patientData: {
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string;
    password: string;
  }): Observable<FHIRPatient> {
    return this.http.post<FHIRPatient>(this.baseUrl, patientData);
  }
}
