import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectedPatientService } from '../services/selectedPatient/selected-patient';
import { PatientApiService } from '../services/patientApi/patient-api-service';
import { PatientSummaryDTO } from '../models/patient.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users implements OnInit {
  private externalPatients = false;
  private _patients: PatientSummaryDTO[] = [];
  loading = true;
  error: string | null = null;
  selectedId: string | number | null = null; // Tracks selected patient for UI styling

  @Input()
  set patients(value: PatientSummaryDTO[] | null) {
    this.externalPatients = true;
    this._patients = value ?? [];
    this.loading = false;
  }

  get patients(): PatientSummaryDTO[] {
    return this._patients;
  }

  constructor(
    private selectedPatientService: SelectedPatientService,
    private patientApi: PatientApiService,
  ) {}

  ngOnInit() {
    // 1. Load patient data from the backend unless a parent supplies the list.
    if (!this.externalPatients) {
      this.loadPatients();
    }

    // 2. Subscribe to the selected patient ID to apply the '.selected' CSS class
    this.selectedPatientService.selectedPatientId$.subscribe(
      (id: string | null) => {
        this.selectedId = id;
      },
    );
  }

  loadPatients() {
    this.loading = true;
    this.error = null;
    this.patientApi.getPatients().subscribe({
      next: (patients: PatientSummaryDTO[]) => {
        this._patients = patients;
        this.loading = false;
      },
      error: (err: unknown) => {
        console.error('Failed to load patients', err);
        this.error =
          'Failed to load patients. Make sure the backend is running.';
        this.loading = false;
      },
    });
  }

  onPatientClick(patient: PatientSummaryDTO) {
    this.selectedPatientService.selectPatient(patient.id);
  }

  /**
   * Returns the status of the patient's data freshness:
   * 'green'  = updated within last 30 days
   * 'yellow' = older than 30 days
   */
  getStatus(lastUpdated: string): 'green' | 'yellow' {
    if (!lastUpdated) return 'yellow'; // Fallback if data is missing
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffDays =
      (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30 ? 'green' : 'yellow';
  }
}
