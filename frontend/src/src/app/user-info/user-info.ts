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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-user-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css',
})
export class UserInfo implements OnInit {
  // Set to true to preview all card states without a server connection.
  static readonly _mockMode = true;

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
  private rawObservations: any[] = [];
  private rawDiagnosticReports: any[] = [];
  private rawCompositions: any[] = [];

  // One entry per DocumentReference: linked DiagnosticReport + Observations + Composition
  enrichedLabData: { report: any; observations: any[]; composition: any | null }[] = [];

  constructor(
    private selectedPatientService: SelectedPatientService,
    private patientApi: PatientApiService,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    if (UserInfo._mockMode) {
      this.loadMockLabData();
      return;
    }
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

    //mock
    // this.patientDetails = {
    //   id: id,
    //   name: 'Mock Patient',
    //   age: 40,
    //   primaryDiagnosis: 'Hypertension',
    //   activeConditions: ['High BP'],
    //   currentMedications: ['Amlodipine'],
    //   recentProcedures: [],
    //   recentLabResults: [],
    //   episodes: []
    // } as any;

    // this.loading = false;
    // return;
    //mock

    forkJoin({
      patient: this.patientApi.getPatientById(id),
      conditions: this.patientApi.getPatientConditions(id),
      encounters: this.patientApi.getPatientEncounters(id),
      medications: this.patientApi.getPatientMedicationRequests(id),
      procedures: this.patientApi.getPatientProcedures(id),
      documentReferences: this.patientApi.getPatientDocumentReferences(id),
      episodesOfCare: this.patientApi.getPatientEpisodesOfCare(id),
      observations: this.patientApi.getPatientObservations(id),
      diagnosticReports: this.patientApi.getPatientDiagnosticReports(id),
      compositions: this.patientApi.getPatientCompositions(id),
    }).subscribe({
      next: (data: {
        patient: any;
        conditions: any;
        encounters: any;
        medications: any;
        procedures: any;
        documentReferences: any;
        episodesOfCare: any[];
        observations: any;
        diagnosticReports: any;
        compositions: any;
      }) => {
        const { patient, conditions, medications, procedures, documentReferences, episodesOfCare, observations, diagnosticReports, compositions } = data;
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

        // Store Observations, DiagnosticReports, Compositions
        this.rawObservations = ((observations?.entry ?? []) as any[]).map((e: any) => e.resource).filter(Boolean);
        this.rawDiagnosticReports = ((diagnosticReports?.entry ?? []) as any[]).map((e: any) => e.resource).filter(Boolean);
        this.rawCompositions = ((compositions?.entry ?? []) as any[]).map((e: any) => e.resource).filter(Boolean);

        // Build enriched data: link each DocumentReference to its DiagnosticReport, Observations, and Composition
        this.enrichedLabData = this._buildEnrichedLabData();

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

  viewOriginalPdf(index: number): void {
    if (UserInfo._mockMode) {
      alert('Mock mode: no real PDF available.\nIn production this opens the original scanned document.');
      return;
    }
    this.openLabPdf(index);
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

  // ── Mock data ────────────────────────────────────────────────────────────

  private loadMockLabData(): void {
    this.patientDetails = {
      id: 'mock-patient-001',
      name: 'Saubhik Bhaumik',
      age: 34,
      gender: 'male',
      lastUpdated: new Date().toISOString(),
      primaryDiagnosis: 'Lymphopenia (mild)',
      activeConditions: ['Lymphopenia', 'Iron-deficiency anemia'],
      currentMedications: ['Ferrous Sulfate 200mg daily', 'Vitamin D3 1000 IU daily'],
      recentProcedures: [],
      recentLabResults: [
        'CBC Panel (10/17/2024)',
        'Lipid Panel (10/17/2024)',
        'Urinalysis — no linked data (10/17/2024)',
      ],
      episodes: [],
    };

    // Mock DocumentReferences — first two have a sentinel URL so hasLabPdf returns true
    this.rawDocumentReferences = [
      { id: 'mock-dr-1', date: '2024-10-17', type: { text: 'Laboratory Report' },
        content: [{ attachment: { contentType: 'application/pdf', url: 'MOCK_PDF', title: 'CBC Panel.pdf' } }] },
      { id: 'mock-dr-2', date: '2024-10-17', type: { text: 'Laboratory Report' },
        content: [{ attachment: { contentType: 'application/pdf', url: 'MOCK_PDF', title: 'Lipid Panel.pdf' } }] },
      { id: 'mock-dr-3', date: '2024-10-17', type: { text: 'Laboratory Report' } },
    ];

    // Directly populate enrichedLabData with realistic mock linked resources
    this.enrichedLabData = [

      // ── Lab 1: CBC — mix of N / L / H results + low-confidence warnings ──
      {
        composition: {
          title: 'Complete Blood Count — Clinical Summary',
          date: '2024-10-17',
          section: [{
            title: 'Summary',
            text: {
              status: 'generated',
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>CBC results are largely within normal limits. The key finding is <strong>lymphopenia</strong> (Lymphocyte count 18%, below the reference range of 20–40%). Hemoglobin is normal at 15.0 g/dL. Total Leukocyte Count is mildly elevated at 10.5 K/µL. Recommend clinical correlation and follow-up if symptoms persist.</p></div>',
            },
          }],
        },
        report: { code: { text: 'Complete Blood Count' }, status: 'final' },
        observations: [
          {
            code: { text: 'HEMOGLOBIN', coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
            valueQuantity: { value: 15.0, unit: 'g/dL' },
            interpretation: [{ coding: [{ code: 'N' }] }],
            referenceRange: [{ low: { value: 13.0, unit: 'g/dL' }, high: { value: 17.0, unit: 'g/dL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
          {
            code: { text: 'TOTAL LEUKOCYTE COUNT', coding: [{ system: 'http://loinc.org', code: '6690-2', display: 'Leukocytes' }] },
            valueQuantity: { value: 10.5, unit: 'K/µL' },
            interpretation: [{ coding: [{ code: 'H' }] }],
            referenceRange: [{ low: { value: 4.0, unit: 'K/µL' }, high: { value: 10.0, unit: 'K/µL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 0.0 }],
          },
          {
            code: { text: 'NEUTROPHILS', coding: [{ system: 'http://loinc.org', code: '770-8', display: 'Neutrophils/100 leukocytes' }] },
            valueQuantity: { value: 62, unit: '%' },
            interpretation: [{ coding: [{ code: 'N' }] }],
            referenceRange: [{ low: { value: 50, unit: '%' }, high: { value: 70, unit: '%' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 0.0 }],
          },
          {
            code: { text: 'LYMPHOCYTE', coding: [{ system: 'http://loinc.org', code: '736-9', display: 'Lymphocytes/100 leukocytes' }] },
            valueQuantity: { value: 18, unit: '%' },
            interpretation: [{ coding: [{ code: 'L' }] }],
            referenceRange: [{ low: { value: 20, unit: '%' }, high: { value: 40, unit: '%' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 0.0 }],
          },
          {
            code: { text: 'EOSINOPHILS', coding: [{ system: 'http://loinc.org', code: '713-8', display: 'Eosinophils/100 leukocytes' }] },
            valueQuantity: { value: 2, unit: '%' },
            interpretation: [{ coding: [{ code: 'N' }] }],
            referenceRange: [{ low: { value: 1, unit: '%' }, high: { value: 6, unit: '%' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
        ],
      },

      // ── Lab 2: Lipid Panel — elevated cholesterol + low HDL ──
      {
        composition: {
          title: 'Lipid Panel — Clinical Summary',
          date: '2024-10-17',
          section: [{
            title: 'Summary',
            text: {
              status: 'generated',
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Lipid panel indicates <strong>dyslipidaemia</strong>. Total cholesterol is elevated at 210 mg/dL (borderline high). LDL cholesterol is elevated at 145 mg/dL. HDL is below the desirable threshold at 42 mg/dL. Triglycerides are within normal limits. Lifestyle modification and dietary review are recommended.</p></div>',
            },
          }],
        },
        report: { code: { text: 'Lipid Panel' }, status: 'final' },
        observations: [
          {
            code: { text: 'TOTAL CHOLESTEROL', coding: [{ system: 'http://loinc.org', code: '2093-3', display: 'Cholesterol' }] },
            valueQuantity: { value: 210, unit: 'mg/dL' },
            interpretation: [{ coding: [{ code: 'H' }] }],
            referenceRange: [{ low: { value: 0, unit: 'mg/dL' }, high: { value: 200, unit: 'mg/dL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
          {
            code: { text: 'HDL CHOLESTEROL', coding: [{ system: 'http://loinc.org', code: '2085-9', display: 'HDL Cholesterol' }] },
            valueQuantity: { value: 42, unit: 'mg/dL' },
            interpretation: [{ coding: [{ code: 'L' }] }],
            referenceRange: [{ low: { value: 40, unit: 'mg/dL' }, high: { value: 60, unit: 'mg/dL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
          {
            code: { text: 'LDL CHOLESTEROL', coding: [{ system: 'http://loinc.org', code: '13457-7', display: 'LDL Cholesterol' }] },
            valueQuantity: { value: 145, unit: 'mg/dL' },
            interpretation: [{ coding: [{ code: 'H' }] }],
            referenceRange: [{ low: { value: 0, unit: 'mg/dL' }, high: { value: 130, unit: 'mg/dL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
          {
            code: { text: 'TRIGLYCERIDES', coding: [{ system: 'http://loinc.org', code: '2571-8', display: 'Triglycerides' }] },
            valueQuantity: { value: 148, unit: 'mg/dL' },
            interpretation: [{ coding: [{ code: 'N' }] }],
            referenceRange: [{ low: { value: 0, unit: 'mg/dL' }, high: { value: 150, unit: 'mg/dL' } }],
            extension: [{ url: 'http://cfi-care.ai/fhir/StructureDefinition/extraction-confidence', valueDecimal: 1.0 }],
          },
        ],
      },

      // ── Lab 3: Urinalysis — no FHIR resources linked (shows fallback) ──
      {
        composition: null,
        report: null,
        observations: [],
      },

    ];
  }

  // ── Enrichment helpers ──────────────────────────────────────────────────

  private _buildEnrichedLabData(): { report: any; observations: any[]; composition: any | null }[] {
    // Index Observations by FHIR server ID for O(1) lookup
    const obsById = new Map<string, any>(
      this.rawObservations.map((o: any) => [String(o.id), o])
    );

    return this.rawDocumentReferences.map((docRef: any) => {
      const docDate = (docRef.date || docRef.meta?.lastUpdated || '').substring(0, 10);

      // Match DiagnosticReport by same effectiveDateTime date
      const report = this.rawDiagnosticReports.find((dr: any) =>
        (dr.effectiveDateTime || dr.date || '').substring(0, 10) === docDate
      ) ?? null;

      // Resolve Observations referenced by the DiagnosticReport's result[]
      const observations: any[] = (report?.result ?? [])
        .map((ref: any) => {
          // ref.reference can be "Observation/4590/_history/1" or "Observation/4590"
          const parts = (ref.reference ?? '').split('/');
          const id = parts[1] ?? '';
          return id ? obsById.get(id) : null;
        })
        .filter(Boolean);

      // Match Composition by same date
      const composition = this.rawCompositions.find((c: any) =>
        (c.date || '').substring(0, 10) === docDate
      ) ?? null;

      return { report, observations, composition };
    });
  }

  interpretationClass(obs: any): string {
    const code = obs?.interpretation?.[0]?.coding?.[0]?.code ?? '';
    if (code === 'H') return 'badge bg-danger';
    if (code === 'L') return 'badge bg-warning text-dark';
    return 'badge bg-success';
  }

  interpretationLabel(obs: any): string {
    const code = obs?.interpretation?.[0]?.coding?.[0]?.code ?? '';
    if (code === 'H') return 'High';
    if (code === 'L') return 'Low';
    return 'Normal';
  }

  isLowConfidence(obs: any): boolean {
    const ext = (obs?.extension ?? []) as any[];
    const conf = ext.find((e: any) =>
      e.url?.includes('extraction-confidence')
    );
    return conf ? conf.valueDecimal === 0 : false;
  }

  getSafeCompositionSummary(index: number): SafeHtml {
    const comp = this.enrichedLabData[index]?.composition;
    const div = comp?.section?.[0]?.text?.div ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(div);
  }
}
