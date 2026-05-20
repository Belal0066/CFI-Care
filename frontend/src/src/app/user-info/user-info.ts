import { Component, OnInit } from '@angular/core';
import { SelectedPatientService } from '../services/selectedPatient/selected-patient';
import { PatientApiService } from '../services/patientApi/patient-api-service';
import { Router } from '@angular/router';
import {
  PatientDetailsDTO,
  Episode,
  EncounterSummary,
  fhirPatientToDetailsDTO,
  fhirEOCToEpisode,
  extractConditionDisplay,
  extractMedicationDisplay,
  extractProcedureDisplay,
  extractEncounterInfo,
} from '../models/patient.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-user-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css',
})
export class UserInfo implements OnInit {
  patientDetails: PatientDetailsDTO | null = null;
  selectedEpisode: Episode | null = null;
  episodeDropdownOpen = false;
  loading: boolean = false;
  error: string | null = null;

  newEpisodeName = '';
  creatingEpisode = false;
  createEpisodeError: string | null = null;

  private rawConditions: any[] = [];
  private rawMedications: any[] = [];
  private rawProcedures: any[] = [];
  private rawLabResults: string[] = [];
  private rawDocumentReferences: any[] = [];

  constructor(
    private selectedPatientService: SelectedPatientService,
    private patientApi: PatientApiService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.selectedPatientService.selectedPatientId$.subscribe((id: string | null) => {
      if (id !== null) {
        this.loadPatientDetails(id);
      } else {
        this.patientDetails = null;
        this.selectedEpisode = null;
      }
    });
  }

  loadPatientDetails(id: string) {
    this.loading = true;
    this.error = null;
    this.selectedEpisode = null;

    forkJoin({
      patient: this.patientApi.getPatientById(id),
      conditions: this.patientApi.getPatientConditions(id),
      encounters: this.patientApi.getPatientEncounters(id),
      medications: this.patientApi.getPatientMedicationRequests(id),
      procedures: this.patientApi.getPatientProcedures(id),
      documentReferences: this.patientApi.getPatientDocumentReferences(id),
      episodesOfCare: this.patientApi.getPatientEpisodesOfCare(id),
    }).subscribe({
      next: (data: {
        patient: any;
        conditions: any;
        encounters: any;
        medications: any;
        procedures: any;
        documentReferences: any;
        episodesOfCare: any[];
      }) => {
        const { patient, conditions, medications, procedures, documentReferences, episodesOfCare } = data;
        this.patientDetails = fhirPatientToDetailsDTO(patient);

        if (conditions.entry && conditions.entry.length > 0) {
          this.rawConditions = conditions.entry;
          const conditionsList = conditions.entry.map((e: any) =>
            extractConditionDisplay(e.resource),
          );

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

          this.patientDetails.activeConditions = conditions.entry
            .filter((e: any) =>
              e.resource.clinicalStatus?.coding?.some(
                (c: any) => c.code === 'active',
              ),
            )
            .map((e: any) => extractConditionDisplay(e.resource));
        } else {
          this.rawConditions = [];
        }

        if (medications.entry && medications.entry.length > 0) {
          this.rawMedications = medications.entry;
          this.patientDetails.currentMedications = medications.entry
            .filter(
              (e: any) =>
                e.resource.status === 'active' ||
                e.resource.status === 'completed',
            )
            .map((e: any) => extractMedicationDisplay(e.resource));
        } else {
          this.rawMedications = [];
        }

        if (procedures.entry && procedures.entry.length > 0) {
          this.rawProcedures = procedures.entry;
          this.patientDetails.recentProcedures = procedures.entry
            .filter((e: any) => e.resource.status === 'completed')
            .map((e: any) => extractProcedureDisplay(e.resource));
        } else {
          this.rawProcedures = [];
        }

        const docEntries = Array.isArray(documentReferences?.entry)
          ? documentReferences.entry
          : [];
        const patientReference = `Patient/${id}`;
        const filteredDocs = docEntries
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
          .slice(0, 10);

        this.rawDocumentReferences = filteredDocs;
        this.patientDetails.recentLabResults = filteredDocs.map((resource: any) => this.formatLabResult(resource));
        this.rawLabResults = this.patientDetails.recentLabResults || [];

        this.patientDetails.episodes = (episodesOfCare || []).map(
          (eoc: any) => fhirEOCToEpisode(eoc),
        );

        const episodes = this.patientDetails.episodes;
        if (episodes && episodes.length > 0) {
          this.selectEpisode(episodes[0]);
        }

        this.loading = false;
      },
      error: (err: unknown) => {
        console.error('Failed to load patient details', err);
        this.error = 'Failed to load patient details.';
        this.loading = false;
      },
    });
  }

  selectEpisode(ep: Episode) {
    this.selectedEpisode = { ...ep };
    this.episodeDropdownOpen = false;

    this.patientApi.getEpisodeEncounters(ep.id, this.patientDetails!.id).subscribe({
      next: (encounters: any[]) => {
        const encounterRefs = new Set(
          encounters.map((e: any) => `Encounter/${e.id}`),
        );

        const filteredConditions = this.rawConditions.filter((entry: any) => {
          const ref = entry.resource?.encounter?.reference;
          return ref && encounterRefs.has(ref);
        });

        const diagCondition = filteredConditions.find((e: any) =>
          e.resource.category?.some((cat: any) =>
            cat.coding?.some((code: any) => code.code === 'encounter-diagnosis'),
          ),
        );
        this.selectedEpisode!.primaryDiagnosis = diagCondition
          ? extractConditionDisplay(diagCondition.resource)
          : filteredConditions[0]
            ? extractConditionDisplay(filteredConditions[0].resource)
            : '';

        this.selectedEpisode!.activeConditions = filteredConditions
          .filter((e: any) =>
            e.resource.clinicalStatus?.coding?.some(
              (c: any) => c.code === 'active',
            ),
          )
          .map((e: any) => extractConditionDisplay(e.resource));

        this.selectedEpisode!.currentMedications = this.rawMedications
          .filter((e: any) => {
            const ref = e.resource?.encounter?.reference;
            return ref && encounterRefs.has(ref);
          })
          .filter(
            (e: any) =>
              e.resource.status === 'active' ||
              e.resource.status === 'completed',
          )
          .map((e: any) => extractMedicationDisplay(e.resource));

        this.selectedEpisode!.recentProcedures = this.rawProcedures
          .filter((e: any) => {
            const ref = e.resource?.encounter?.reference;
            return ref && encounterRefs.has(ref);
          })
          .filter((e: any) => e.resource.status === 'completed')
          .map((e: any) => extractProcedureDisplay(e.resource));

        this.selectedEpisode!.recentLabResults = this.rawLabResults;

        this.selectedEpisode!.encounters = encounters.map((e: any): EncounterSummary => ({
          id: e.id,
          ...extractEncounterInfo(e),
        }));

        // Fallback: derive medications from Medication-type encounters when FHIR filtering returned none
        if (!this.selectedEpisode!.currentMedications.length) {
          this.selectedEpisode!.currentMedications = this.selectedEpisode!.encounters
            .filter(enc => this.getEncounterTypeInfo(enc.type).label === 'Medication')
            .map(enc => enc.reason || enc.type)
            .filter(Boolean);
        }

        // Fallback: derive primary diagnosis from Diagnosis-type encounters when FHIR filtering returned none
        if (!this.selectedEpisode!.primaryDiagnosis) {
          const diagEnc = this.selectedEpisode!.encounters.find(enc => {
            const label = this.getEncounterTypeInfo(enc.type).label;
            return label === 'AI Diagnosis' || label === 'Diagnosis';
          });
          if (diagEnc) {
            this.selectedEpisode!.primaryDiagnosis = diagEnc.reason || diagEnc.type;
          }
        }
      },
      error: () => {
        // Keep empty arrays on error — the episode card will show "no data" states
      },
    });
  }

  createEpisode() {
    if (!this.newEpisodeName.trim() || !this.patientDetails) return;

    this.creatingEpisode = true;
    this.createEpisodeError = null;

    const eocId = `eoc-${crypto.randomUUID()}`;

    this.patientApi
      .createEpisodeOfCare({
        id: eocId,
        status: 'active',
        patient: { reference: `Patient/${this.patientDetails.id}` },
        type: [{ text: this.newEpisodeName.trim() }],
        period: { start: new Date().toISOString() },
      })
      .subscribe({
        next: (result: any) => {
          const created = result?.data || result;
          const newEpisode = fhirEOCToEpisode(created);
          if (!this.patientDetails!.episodes) {
            this.patientDetails!.episodes = [];
          }
          this.patientDetails!.episodes.push(newEpisode);
          this.selectEpisode(newEpisode);
          this.newEpisodeName = '';
          this.creatingEpisode = false;
        },
        error: () => {
          this.createEpisodeError = 'Failed to create episode. Please try again.';
          this.creatingEpisode = false;
        },
      });
  }

  openMedFlowGraph() {
    if (this.patientDetails) {
      const queryParams = this.selectedEpisode ? { eocId: this.selectedEpisode.id } : {};
      this.router.navigate(['/med-graph', this.patientDetails.id], { queryParams });
    }
  }

  hasLabPdf(index: number): boolean {
    const attachment = this.rawDocumentReferences[index]?.content?.[0]?.attachment;
    return !!(attachment?.url || attachment?.data);
  }

  openLabPdf(index: number): void {
    const attachment = this.rawDocumentReferences[index]?.content?.[0]?.attachment;
    if (!attachment) return;

    if (attachment.url) {
      const url: string = attachment.url;
      // FHIR relative Binary reference (e.g. "Binary/bin-123") — fetch via backend
      const binaryMatch = url.match(/^Binary\/(.+)$/i);
      if (binaryMatch) {
        this.patientApi.getBinaryResource(binaryMatch[1]).subscribe({
          next: (resource: any) => {
            const contentType = resource.contentType || 'application/pdf';
            const rawData = resource.data;
            if (rawData) {
              const byteChars = atob(rawData);
              const byteArray = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
              const blob = new Blob([byteArray], { type: contentType });
              window.open(URL.createObjectURL(blob), '_blank');
            }
          },
          error: () => {},
        });
      } else {
        window.open(url, '_blank');
      }
    } else if (attachment.data && attachment.contentType) {
      const byteChars = atob(attachment.data);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: attachment.contentType });
      window.open(URL.createObjectURL(blob), '_blank');
    }
  }

  private static readonly ENCOUNTER_TYPE_MAP: Record<string, { label: string; color: string; icon: string }> = {
    // SNOMED display strings (from CATEGORY_TYPE_CODING in backend)
    'consultation':                              { label: 'Consultation',  color: '#1E6ED3', icon: 'bi-person-check'          },
    'laboratory findings':                       { label: 'Lab',          color: '#0891b2', icon: 'bi-flask'                  },
    'imaging':                                   { label: 'Imaging',      color: '#6366f1', icon: 'bi-camera'                 },
    'prescription of medication':                { label: 'Medication',   color: '#dc2626', icon: 'bi-capsule'                },
    'computer aided medical decision support':   { label: 'AI Diagnosis', color: '#1E6ED3', icon: 'bi-cpu'                   },
    'follow-up encounter':                       { label: 'Follow-up',    color: '#16a34a', icon: 'bi-arrow-repeat'           },
    'allergy screening':                         { label: 'Allergy',      color: '#d97706', icon: 'bi-exclamation-triangle'   },
    // Explicit type.text values that can appear in FHIR
    'diagnosis encounter':                       { label: 'Diagnosis',    color: '#1E6ED3', icon: 'bi-file-medical'           },
    // Category name shortcuts
    'lab':         { label: 'Lab',          color: '#0891b2', icon: 'bi-flask'                },
    'prescription':{ label: 'Medication',   color: '#dc2626', icon: 'bi-capsule'              },
    'aisuggestion':{ label: 'AI Diagnosis', color: '#1E6ED3', icon: 'bi-cpu'                  },
    'diagnosis':   { label: 'Diagnosis',    color: '#1E6ED3', icon: 'bi-file-medical'          },
    'followup':    { label: 'Follow-up',    color: '#16a34a', icon: 'bi-arrow-repeat'          },
    'allergy':     { label: 'Allergy',      color: '#d97706', icon: 'bi-exclamation-triangle'  },
    'historical':  { label: 'Consultation', color: '#1E6ED3', icon: 'bi-person-check'          },
  };

  getEncounterTypeInfo(type: string): { label: string; color: string; icon: string } {
    const key = (type || '').toLowerCase().trim();
    return UserInfo.ENCOUNTER_TYPE_MAP[key] ?? { label: type || 'Encounter', color: '#64748b', icon: 'bi-calendar2-event' };
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
}
