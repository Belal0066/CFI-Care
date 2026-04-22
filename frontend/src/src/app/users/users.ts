
// // BACKEND
// import { Component } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { SelectedPatientService } from '../services/selectedPatient/selected-patient';

// export interface PatientSummaryDTO {
//   id: number;
//   name: string;
//   age: number;
//   lastUpdated: string; 
// }

// @Component({
//   selector: 'app-users',
//   imports: [CommonModule],
//   templateUrl: './users.html',
//   styleUrl: './users.css'
// })
// export class Users {

//   patients: PatientSummaryDTO[] = [
//     {
//       id: 1,
//       name: 'Name1',
//       age: 24,
//       lastUpdated: '2025-12-18T10:00:00Z'
//     },
//     {
//       id: 2,
//       name: 'Name2',
//       age: 36,
//       lastUpdated: '2025-12-26T08:00:00Z'
//     },
//     {
//       id: 3,
//       name: 'Name3',
//       age: 77,
//       lastUpdated: '2025-12-25T14:30:00Z'
//     }
//   ];

//   constructor(
//     private selectedPatientService: SelectedPatientService
//   ) {}

//   onPatientClick(patient: PatientSummaryDTO) {
//     this.selectedPatientService.selectPatient(patient.id);
//   }



import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectedPatientService } from '../services/selectedPatient/selected-patient';

export interface PatientSummaryDTO {
  id: number;
  name: string;
  age: number;
  lastUpdated: string;
  primaryDiagnosis?: string;
}

@Component({
  selector: 'app-users',
  imports: [CommonModule],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users {
  @Input() patients: PatientSummaryDTO[] = [];

  selectedId: number | null = null;

  constructor(private selectedPatientService: SelectedPatientService) {}

  ngOnInit() {
    this.selectedPatientService.selectedPatientId$.subscribe(id => {
      this.selectedId = id;
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
    const now = new Date();
    const updated = new Date(lastUpdated);
    const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30 ? 'green' : 'yellow';
  }
}