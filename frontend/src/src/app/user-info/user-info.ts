// import { Component } from '@angular/core';
// import { SelectedPatientService } from '../services/selectedPatient/selected-patient';
// import { CommonModule } from '@angular/common';
// import { Router } from '@angular/router';

// @Component({
//   selector: 'app-user-info',
//   imports: [CommonModule],
//   templateUrl: './user-info.html',
//   styleUrl: './user-info.css'
// })
// export class UserInfo {

//   selectedPatient: any | null = null;

//   constructor(
//     private selectedPatientService: SelectedPatientService,
//     private router: Router
//   ) {}

//   ngOnInit() {
//     this.selectedPatientService.selectedPatient$
//       .subscribe(patient => {
//         this.selectedPatient = patient;
//       });
//   }

//   openMedFlowGraph() {
//     if (this.selectedPatient) {
//       // Navigate to the med-graph route
//       // Optionally pass the patient ID
//       this.router.navigate(['/med-graph', this.selectedPatient.id]);
//     }
//   }

// }



//BACKEND
import { Component, OnInit } from '@angular/core';
import { SelectedPatientService } from '../services/selectedPatient/selected-patient';
import { PatientApiService } from '../services/patientApi/patient-api-service';
import { Router } from '@angular/router';
import { PatientDetailsDTO } from '../models/patient.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-info',
  imports: [CommonModule],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css'
})
export class UserInfo {

  patientDetails: PatientDetailsDTO | null = null;
  // loading: boolean = false;
  // error: string | null = null;

  constructor(
    private selectedPatientService: SelectedPatientService,
    // private patientApi: PatientApiService,
    private router: Router
  ) {}

  //Use the one below this one!!!
  ngOnInit() {
    this.selectedPatientService.selectedPatientId$
      .subscribe(id => {
        if (id !== null) {
          this.loadPatientDetails(id);
        } else {
          this.patientDetails = null;
        }
      });
  }

  //USE THIS: 
  // ngOnInit() {
  //   // Subscribe to selected patient ID
  //   this.selectedPatientService.selectedPatientId$.subscribe(id => {
  //     if (id !== null) {
  //       this.fetchPatientDetails(id);
  //     } else {
  //       this.patientDetails = null;
  //     }
  //   });
  // }

  //fetchPatientDetails HERE
  // fetchPatientDetails(id: number) {
  //   this.loading = true;
  //   this.error = null;

  //   this.patientApi.getPatientById(id).subscribe({
  //     next: (details) => {
  //       this.patientDetails = details;
  //       this.loading = false;
  //     },
  //     error: (err) => {
  //       console.error('Failed to load patient details', err);
  //       this.error = 'Failed to load patient details.';
  //       this.loading = false;
  //     }
  //   });
  // }

  loadPatientDetails(id: number) {
    // 🔧 BACKEND PLACEHOLDER (mock data)
    this.patientDetails = {
      id,
      name: 'Mahmoud Karim',
      age: 23,
      gender: "Male",
      lastUpdated: '2026-02-18',

      primaryDiagnosis: 'Type 2 Diabetes',
      activeConditions: ['Hypertension', 'Hyperlipidemia'],
      currentMedications: ['Metformin', 'Atorvastatin'],
      recentLabResults: ['HbA1c 7.2%', 'LDL 110 mg/dL'],
      recentProcedures: ['Cardiac Stress Test']
    };
  }

  openMedFlowGraph() {
    if (this.patientDetails) {
      this.router.navigate(['/med-graph', this.patientDetails.id]);
    }
  }

  //FETCHING FROM BACKEND (EDIT AS U NEED)
//   constructor(
//   private selectedPatientService: SelectedPatientService,
//   private patientApi: PatientApiService,
//   private router: Router
// ) {}

// loadPatientDetails(id: number) {
//   this.patientApi.getPatientById(id)
//     .subscribe(details => {
//       this.patientDetails = details;
//     });
// }

}
