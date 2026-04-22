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
  extractMedicationDisplay,
  extractProcedureDisplay,
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
    private router: Router,
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

    // Fetch patient, conditions, encounters, medications, and procedures in parallel
    forkJoin({
      patient: this.patientApi.getPatientById(id),
      conditions: this.patientApi.getPatientConditions(id),
      encounters: this.patientApi.getPatientEncounters(id),
      medications: this.patientApi.getPatientMedicationRequests(id),
      procedures: this.patientApi.getPatientProcedures(id),
      documentReferences: this.patientApi.getPatientDocumentReferences(id),
    }).subscribe({
      next: ({
        patient,
        conditions,
        encounters,
        medications,
        procedures,
        documentReferences,
      }) => {
        // Transform FHIR Patient to PatientDetailsDTO
        this.patientDetails = fhirPatientToDetailsDTO(patient);

        // Extract conditions from FHIR Bundle
        if (conditions.entry && conditions.entry.length > 0) {
          const conditionsList = conditions.entry.map((e: any) =>
            extractConditionDisplay(e.resource),
          );

          // Find primary diagnosis (first condition marked as encounter-diagnosis or first condition)
          const diagnosisCondition = conditions.entry.find((e: any) =>
            e.resource.category?.some((cat: any) =>
              cat.coding?.some(
                (code: any) => code.code === 'encounter-diagnosis',
              ),
            ),
          );
          this.patientDetails.primaryDiagnosis = diagnosisCondition
            ? extractConditionDisplay(diagnosisCondition.resource)
            : conditionsList[0] || '';

          // Active conditions are those with clinicalStatus 'active'
          this.patientDetails.activeConditions = conditions.entry
            .filter((e: any) =>
              e.resource.clinicalStatus?.coding?.some(
                (c: any) => c.code === 'active',
              ),
            )
            .map((e: any) => extractConditionDisplay(e.resource));
        }

        // Extract medication requests from FHIR Bundle
        if (medications.entry && medications.entry.length > 0) {
          // Filter for active medications only
          this.patientDetails.currentMedications = medications.entry
            .filter(
              (e: any) =>
                e.resource.status === 'active' ||
                e.resource.status === 'completed',
            )
            .map((e: any) => extractMedicationDisplay(e.resource));
        }

        // Extract procedures from FHIR Bundle
        if (procedures.entry && procedures.entry.length > 0) {
          // Filter for completed procedures and map to display strings
          this.patientDetails.recentProcedures = procedures.entry
            .filter((e: any) => e.resource.status === 'completed')
            .map((e: any) => extractProcedureDisplay(e.resource));
        }

        // Extract recent lab documents uploaded by the patient from DocumentReference bundle
        const docEntries = Array.isArray(documentReferences?.entry)
          ? documentReferences.entry
          : [];

        const patientReference = `Patient/${id}`;

        this.patientDetails.recentLabResults = docEntries
          .map((entry: any) => entry?.resource)
          .filter(
            (resource: any) =>
              resource &&
              resource.resourceType === 'DocumentReference' &&
              this.isLabDocument(resource) &&
              this.isUploadedByPatient(resource, patientReference),
          )
          .sort((a: any, b: any) => {
            const timeA = Date.parse(a?.date || a?.meta?.lastUpdated || '');
            const timeB = Date.parse(b?.date || b?.meta?.lastUpdated || '');
            return (
              (Number.isNaN(timeB) ? 0 : timeB) -
              (Number.isNaN(timeA) ? 0 : timeA)
            );
          })
          .slice(0, 10)
          .map((resource: any) => this.formatLabResult(resource));

        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load patient details', err);
        this.error = 'Failed to load patient details.';
        this.loading = false;
      },
    });
  }

  private isLabDocument(documentReference: any): boolean {
    const typeText = (documentReference?.type?.text || '')
      .toString()
      .toLowerCase();
    const codings = Array.isArray(documentReference?.type?.coding)
      ? documentReference.type.coding
      : [];

    return (
      typeText.includes('lab') ||
      codings.some((coding: any) => {
        const code = (coding?.code || '').toString();
        const display = (coding?.display || '').toString().toLowerCase();
        return code === '11502-2' || display.includes('laboratory');
      })
    );
  }

  private isUploadedByPatient(
    documentReference: any,
    patientReference: string,
  ): boolean {
    const authors = Array.isArray(documentReference?.author)
      ? documentReference.author
      : [];

    // Keep older records visible when author is omitted.
    if (authors.length === 0) return true;

    return authors.some(
      (author: any) => author?.reference?.toString() === patientReference,
    );
  }

  private formatLabResult(documentReference: any): string {
    const attachment = documentReference?.content?.[0]?.attachment || {};
    const title =
      attachment.title ||
      documentReference?.description ||
      documentReference?.type?.text ||
      `Lab Report ${documentReference?.id || ''}`;

    const rawDate =
      documentReference?.date || documentReference?.meta?.lastUpdated || '';
    const date = rawDate ? new Date(rawDate).toLocaleString() : 'Unknown date';

    return `${title} (${date})`;
  }

  openMedFlowGraph() {
    if (this.patientDetails) {
      this.router.navigate(['/med-graph', this.patientDetails.id]);
    }
  }
}
