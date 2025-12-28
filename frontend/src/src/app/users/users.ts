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
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectedPatientService } from '../services/selectedPatient/selected-patient';

export interface PatientSummaryDTO {
  id: number;
  name: string;
  age: number;
  lastUpdated: string; 
}

@Component({
  selector: 'app-users',
  imports: [CommonModule],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users {

  patients: PatientSummaryDTO[] = [
    {
      id: 1,
      name: 'Name1',
      age: 24,
      lastUpdated: '2025-12-18T10:00:00Z'
    },
    {
      id: 2,
      name: 'Name2',
      age: 36,
      lastUpdated: '2025-12-26T08:00:00Z'
    },
    {
      id: 3,
      name: 'Name3',
      age: 77,
      lastUpdated: '2025-12-25T14:30:00Z'
    }
  ];

  constructor(
    private selectedPatientService: SelectedPatientService
  ) {}

  onPatientClick(patient: PatientSummaryDTO) {
    this.selectedPatientService.selectPatient(patient.id);
  }


  //NOTEEEE: THis updates users component to use API
// constructor(
//   private selectedPatientService: SelectedPatientService,
//   private patientApi: PatientApiService
// ) {}

// ngOnInit() {
//   this.patientApi.getPatients().subscribe(patients => {
//     this.patients = patients;
//   });
// }

}


