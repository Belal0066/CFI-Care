import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  VerifyOtpResponse,
  Grant,
  PendingGrant,
  HandshakeStatus,
} from '../../models/grant.model';
import { PatientSummaryDTO } from '../../models/patient.model';

@Injectable({
  providedIn: 'root',
})
export class HandshakeService {
  private readonly handshakesEndpoint = '/handshakes';
  private readonly grantsEndpoint='/api/practitioner-grants';
  // ma3rfsh law m7tgnha begad
  private readonly patientEndpoint='/api/patient-grants';

  constructor(private http: HttpClient) {}

  // Practitioner: submit OTP received from patient
  verifyOtp(otp: string): Observable<VerifyOtpResponse> {
    return this.http.post<VerifyOtpResponse>(
      `${this.handshakesEndpoint}/verify-practitioner-otp`,
      { otp },
      { withCredentials: true }
    );
  }

  // Practitioner: poll handshake status after OTP verified
  pollStatus(handshakeId: string, patientId?: string): Observable<HandshakeStatus> {
    const params: Record<string, string> = {};
    if (patientId) params['patientId'] = patientId;
    return this.http.get<HandshakeStatus>(
      `${this.handshakesEndpoint}/status/${handshakeId}`,
      { params, withCredentials: true }
    );
  }

  // Patient: approve or deny a pending grant request
  respondToGrant(
    handshakeId: string,
    approved: boolean,
    durationMinutes?: number,
    scopes?: string[]
  ): Observable<{ message: string; grant?: Grant }> {
    return this.http.post<{ message: string; grant?: Grant }>(
      `${this.handshakesEndpoint}/create-grant`,
      { handshakeId, approved, durationMinutes, scopes },
      { withCredentials: true }
    );
  }

  // Patient: revoke an active grant for a specific practitioner
  revokeGrant(practitionerId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.patientEndpoint}/grants/${practitionerId}`,
      { withCredentials: true }
    );
  }

  // Patient: list all pending grant requests awaiting approval
  getPendingGrants(): Observable<{ pending: PendingGrant[] }> {
    return this.http.get<{ pending: PendingGrant[] }>(
      `${this.patientEndpoint}/pending`,
      { withCredentials: true }
    );
  }

  // Patient: list all currently active grants
  getActiveGrants(): Observable<{ grants: Grant[] }> {
    return this.http.get<{ grants: Grant[] }>(
      `${this.patientEndpoint}/grants`,
      { withCredentials: true }
    );
  }

  // Practitioner: list patients who have granted them access
  getGrantedPatients(): Observable<{ patients: PatientSummaryDTO[] }> {
    return this.http.get<{ patients: PatientSummaryDTO[] }>(
      `${this.grantsEndpoint}/my-patients`,
      { withCredentials: true }
    );
  }
}
