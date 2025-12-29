// import { Component } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { SelectedPatientService } from '../services/selectedPatient/selected-patient';

// @Component({
//   selector: 'app-users',
//   imports: [CommonModule],
//   templateUrl: './users.html',
//   styleUrl: './users.css'
// })
// export class Users {

//   patients = [
//     { id: 1, name: 'Name1', updated: '1 week ago', age: '24y' },
//     { id: 2, name: 'Name2', updated: 'today', age: '36y' },
//     { id: 3, name: 'Name3', updated: 'yesterday', age: '77y' },
//     { id: 4, name: 'Name3', updated: 'yesterday', age: '47y' },
//     { id: 5, name: 'Name3', updated: 'yesterday', age: '57y' },
//     //add more patients data
//   ];

//   constructor(private selectedPatientService: SelectedPatientService) {}

//   onPatientClick(patient: any) {
//     this.selectedPatientService.selectPatient(patient);
//   }

// }

// export interface PatientSummaryDTO {
//   id: number;
//   name: string;
//   age: number;
//   lastUpdated: string; // ISO
// }

// BACKEND
import { Component, OnInit } from '@angular/core';
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
  patients: PatientSummaryDTO[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    private selectedPatientService: SelectedPatientService,
    private patientApi: PatientApiService
  ) {}

  ngOnInit() {
    this.loadPatients();
  }

  loadPatients() {
    this.loading = true;
    this.error = null;
    this.patientApi.getPatients().subscribe({
      next: (patients) => {
        this.patients = patients;
        this.loading = false;
      },
      error: (err) => {
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
}
