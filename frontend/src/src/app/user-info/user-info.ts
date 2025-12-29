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
  extractConditionDisplay,
  extractEncounterInfo,
} from '../models/patient.model';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';

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

    // Fetch patient, conditions, and encounters in parallel
    forkJoin({
      patient: this.patientApi.getPatientById(id),
      conditions: this.patientApi.getPatientConditions(id),
      encounters: this.patientApi.getPatientEncounters(id),
    }).subscribe({
      next: ({ patient, conditions, encounters }) => {
        // Transform FHIR Patient to PatientDetailsDTO
        this.patientDetails = fhirPatientToDetailsDTO(patient);

        // Extract conditions from FHIR Bundle
        if (conditions.entry && conditions.entry.length > 0) {
          const conditionsList = conditions.entry.map((e: any) =>
            extractConditionDisplay(e.resource)
          );

          // Find primary diagnosis (first condition marked as encounter-diagnosis or first condition)
          const diagnosisCondition = conditions.entry.find((e: any) =>
            e.resource.category?.some((cat: any) =>
              cat.coding?.some(
                (code: any) => code.code === 'encounter-diagnosis'
              )
            )
          );
          this.patientDetails.primaryDiagnosis = diagnosisCondition
            ? extractConditionDisplay(diagnosisCondition.resource)
            : conditionsList[0] || '';

          // Active conditions are those with clinicalStatus 'active'
          this.patientDetails.activeConditions = conditions.entry
            .filter((e: any) =>
              e.resource.clinicalStatus?.coding?.some(
                (c: any) => c.code === 'active'
              )
            )
            .map((e: any) => extractConditionDisplay(e.resource));
        }

        // Extract encounter info (procedures, diagnoses from encounters)
        if (encounters.entry && encounters.entry.length > 0) {
          const encounterInfo = encounters.entry.map((e: any) =>
            extractEncounterInfo(e.resource)
          );

          // Recent procedures from encounters with type/reason
          this.patientDetails.recentProcedures = encounterInfo
            .filter((info: any) => info.reason)
            .map((info: any) => `${info.reason} (${info.date})`);
        }

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
