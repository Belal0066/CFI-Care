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
import {
  PatientDetailsDTO,
  FHIRPatient,
  fhirPatientToDetailsDTO,
} from '../models/patient.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css',
})
export class UserInfo implements OnInit {
  patientDetails: PatientDetailsDTO | null = null;
  loading: boolean = false;
  error: string | null = null;

  constructor(
    private selectedPatientService: SelectedPatientService,
    private patientApi: PatientApiService,
    private router: Router
  ) {}

  ngOnInit() {
    this.selectedPatientService.selectedPatientId$.subscribe((id) => {
      if (id !== null) {
        this.loadPatientDetails(id);
      } else {
        this.patientDetails = null;
      }
    });
  }

  loadPatientDetails(id: string) {
    this.loading = true;
    this.error = null;
    this.patientApi.getPatientById(id).subscribe({
      next: (patient: FHIRPatient) => {
        // Transform FHIR Patient to PatientDetailsDTO
        this.patientDetails = fhirPatientToDetailsDTO(patient);
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load patient details', err);
        this.error = 'Failed to load patient details.';
        this.loading = false;
      },
    });
  }

  openMedFlowGraph() {
    if (this.patientDetails) {
      this.router.navigate(['/med-graph', this.patientDetails.id]);
    }
  }
}
