import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PatientSummaryDTO, PatientDetailsDTO } from '../../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class PatientApiService {

  private baseUrl = '/api/patients'; // adjust to backend

  constructor(private http: HttpClient) {}

  // Get list of patient summaries (for Users component)
  getPatients(): Observable<PatientSummaryDTO[]> {
    return this.http.get<PatientSummaryDTO[]>(this.baseUrl);
  }

  // Get details of one patient (for UserInfo)
  getPatientById(id: number): Observable<PatientDetailsDTO> {
    return this.http.get<PatientDetailsDTO>(`${this.baseUrl}/${id}`);
  }

  // in PatientApiService
  getPatientGraph(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${id}/graph`);
  }

}
