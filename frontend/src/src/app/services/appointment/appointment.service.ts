import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Practitioner {
  id: string;
  name: string;
  title: string;
  specialty: string;
}

export interface Schedule {
  resourceType: string;
  id: string;
  active: boolean;
  actor: Array<{ reference: string }>;
  planningHorizon?: {
    start: string;
    end: string;
  };
}

export interface Slot {
  resourceType: string;
  id: string;
  schedule: { reference: string };
  status: string;
  start: string;
  end: string;
}

export interface Appointment {
  resourceType: string;
  id: string;
  status: string;
  appointmentType?: any;
  start: string;
  end: string;
  participant: Array<{
    actor: { reference: string };
    status: string;
  }>;
}

export interface BookAppointmentRequest {
  patientId: string;
  practitionerId: string;
  slotId: string;
  start: string;
  end: string;
  appointmentType: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppointmentService {
  private practitionersUrl = '/api/practitioners';
  private schedulesUrl = '/api/schedules';
  private slotsUrl = '/api/slots';
  private appointmentsUrl = '/api/appointments';

  constructor(private http: HttpClient) {}

  // Get all practitioners (doctors)
  getPractitioners(specialty?: string): Observable<Practitioner[]> {
    const url = specialty
      ? `${this.practitionersUrl}?specialtyDetail=${specialty}`
      : this.practitionersUrl;
    return this.http.get<Practitioner[]>(url);
  }

  // Get practitioner by ID
  getPractitionerById(id: string): Observable<any> {
    return this.http.get<any>(`${this.practitionersUrl}/${id}`);
  }

  // Get schedules for a practitioner
  getSchedulesByPractitioner(practitionerId: string): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(
      `${this.schedulesUrl}/practitioner/${practitionerId}`,
    );
  }

  // Get all schedules
  getAllSchedules(): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(this.schedulesUrl);
  }

  // Create a schedule
  createSchedule(scheduleData: any): Observable<Schedule> {
    return this.http.post<Schedule>(this.schedulesUrl, scheduleData);
  }

  // Get slots for a practitioner
  getSlotsByPractitioner(practitionerId: string): Observable<Slot[]> {
    return this.http.get<Slot[]>(
      `${this.slotsUrl}/practitioner/${practitionerId}`,
    );
  }

  // Get slots for a schedule
  getSlotsBySchedule(scheduleId: string): Observable<Slot[]> {
    return this.http.get<Slot[]>(`${this.slotsUrl}/schedule/${scheduleId}`);
  }

  // Get available slots for a practitioner
  getAvailableSlots(practitionerId: string): Observable<Slot[]> {
    return this.http.get<Slot[]>(
      `${this.slotsUrl}/practitioner/${practitionerId}?status=free`,
    );
  }

  // Create a slot
  createSlot(slotData: any): Observable<Slot> {
    return this.http.post<Slot>(this.slotsUrl, slotData);
  }

  // Update slot status
  updateSlotStatus(slotId: string, status: string): Observable<Slot> {
    return this.http.patch<Slot>(`${this.slotsUrl}/${slotId}`, { status });
  }

  // Get appointments for a patient
  getAppointmentsByPatient(patientId: string): Observable<any> {
    return this.http.get<any>(`${this.appointmentsUrl}/patient/${patientId}`);
  }

  // Get appointments for a practitioner
  getAppointmentsByPractitioner(practitionerId: string): Observable<any> {
    return this.http.get<any>(
      `${this.appointmentsUrl}/practitioner/${practitionerId}`,
    );
  }

  // Book an appointment
  bookAppointment(request: BookAppointmentRequest): Observable<Appointment> {
    return this.http.post<Appointment>(this.appointmentsUrl, request);
  }

  // Cancel appointment
  cancelAppointment(appointmentId: string): Observable<any> {
    return this.http.patch<any>(`${this.appointmentsUrl}/${appointmentId}`, {
      status: 'cancelled',
    });
  }

  // Get appointment by ID
  getAppointmentById(appointmentId: string): Observable<Appointment> {
    return this.http.get<Appointment>(
      `${this.appointmentsUrl}/${appointmentId}`,
    );
  }
}
