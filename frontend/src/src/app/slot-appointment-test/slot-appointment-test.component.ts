import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  Appointment,
  AppointmentService,
  BinaryResource,
  DocumentReferenceResource,
  Slot,
} from '../services/appointment/appointment.service';

@Component({
  selector: 'app-slot-appointment-test',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './slot-appointment-test.component.html',
  styleUrl: './slot-appointment-test.component.css',
})
export class SlotAppointmentTestComponent implements OnInit {
  slotId = '';
  practitionerId = '';

  slot: Slot | null = null;
  relatedAppointments: Appointment[] = [];
  selectedAppointment: Appointment | null = null;
  selectedPatientId = '';
  documents: DocumentReferenceResource[] = [];

  loading = false;
  loadingDocuments = false;
  errorMessage = '';
  linkedDocumentIds: string[] = [];
  hasTriedLoadDocuments = false;

  constructor(
    private route: ActivatedRoute,
    private appointmentService: AppointmentService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.slotId = params.get('slotId') || '';
      this.practitionerId = params.get('practitionerId') || '';
      this.loadSlotRelatedData();
    });
  }

  loadSlotRelatedData(): void {
    this.errorMessage = '';
    this.slot = null;
    this.relatedAppointments = [];
    this.selectedAppointment = null;
    this.documents = [];
    this.selectedPatientId = '';

    if (!this.slotId) {
      this.errorMessage = 'Missing slotId in query params.';
      return;
    }

    if (!this.practitionerId) {
      this.errorMessage =
        'Missing practitionerId in query params. Open this page from practitioner profile test.';
      return;
    }

    this.loading = true;

    this.appointmentService.getSlotById(this.slotId).subscribe({
      next: (slotData) => {
        this.slot = slotData;

        this.appointmentService
          .getAppointmentsByPractitioner(this.practitionerId)
          .subscribe({
            next: (bundle) => {
              const appointments = this.extractAppointments(bundle);
              this.relatedAppointments = appointments.filter((appointment) =>
                this.belongsToSlot(appointment, this.slotId),
              );

              if (this.relatedAppointments.length > 0) {
                const sorted = [...this.relatedAppointments].sort((a, b) => {
                  const aHasDocs =
                    this.getDocumentReferenceIdsFromAppointment(a).length > 0
                      ? 1
                      : 0;
                  const bHasDocs =
                    this.getDocumentReferenceIdsFromAppointment(b).length > 0
                      ? 1
                      : 0;
                  if (aHasDocs !== bHasDocs) return bHasDocs - aHasDocs;

                  const aBooked =
                    (a.status || '').toLowerCase() === 'booked' ? 1 : 0;
                  const bBooked =
                    (b.status || '').toLowerCase() === 'booked' ? 1 : 0;
                  if (aBooked !== bBooked) return bBooked - aBooked;

                  const aId = Number(a.id) || 0;
                  const bId = Number(b.id) || 0;
                  return bId - aId;
                });

                this.selectAppointment(sorted[0]);
              }

              this.loading = false;
            },
            error: (error) => {
              this.loading = false;
              this.errorMessage = `Failed to load appointments: ${error.message}`;
            },
          });
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = `Failed to load slot: ${error.message}`;
      },
    });
  }

  selectAppointment(appointment: Appointment): void {
    this.selectedAppointment = appointment;
    this.documents = [];
    this.selectedPatientId = this.getPatientIdFromAppointment(appointment);
    this.linkedDocumentIds =
      this.getDocumentReferenceIdsFromAppointment(appointment);
    this.hasTriedLoadDocuments = false;
  }

  loadSelectedAppointmentDocuments(): void {
    if (!this.selectedAppointment) {
      return;
    }

    this.hasTriedLoadDocuments = true;

    if (this.linkedDocumentIds.length === 0) {
      this.loadingDocuments = false;
      return;
    }

    if (!this.selectedPatientId) {
      return;
    }

    this.loadingDocuments = true;
    this.appointmentService
      .getDocumentReferencesByPatient(this.selectedPatientId)
      .subscribe({
        next: (bundle) => {
          const allPatientDocuments = this.extractDocumentReferences(bundle);
          const linkedIdSet = new Set(this.linkedDocumentIds);

          this.documents = allPatientDocuments.filter((document) =>
            linkedIdSet.has(document.id),
          );

          this.loadingDocuments = false;
        },
        error: (error) => {
          this.loadingDocuments = false;
          this.errorMessage = `Failed to load patient documents: ${error.message}`;
        },
      });
  }

  private belongsToSlot(appointment: Appointment, slotId: string): boolean {
    const raw = appointment as any;
    const slotRefs = Array.isArray(raw.slot) ? raw.slot : [];
    return slotRefs.some((item: any) => {
      const ref = item?.reference?.toString() || '';
      return ref === `Slot/${slotId}` || ref.endsWith(`/${slotId}`);
    });
  }

  private extractAppointments(bundle: any): Appointment[] {
    const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
    return entries
      .map((entry: any) => entry?.resource)
      .filter(
        (resource: any) =>
          resource && resource.resourceType === 'Appointment' && resource.id,
      );
  }

  private extractDocumentReferences(bundle: any): DocumentReferenceResource[] {
    const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
    return entries
      .map((entry: any) => entry?.resource)
      .filter(
        (resource: any) =>
          resource &&
          resource.resourceType === 'DocumentReference' &&
          resource.id,
      );
  }

  private getPatientIdFromAppointment(appointment: Appointment): string {
    const participants = Array.isArray(appointment.participant)
      ? appointment.participant
      : [];

    for (const participant of participants) {
      const reference = participant?.actor?.reference?.toString() || '';
      if (reference.startsWith('Patient/')) {
        return reference.split('/').pop() || '';
      }
    }

    return '';
  }

  private getDocumentReferenceIdsFromAppointment(
    appointment: Appointment,
  ): string[] {
    const raw = appointment as any;
    const supportingInformation = Array.isArray(raw?.supportingInformation)
      ? raw.supportingInformation
      : [];

    return supportingInformation
      .map((item: any) => item?.reference?.toString() || '')
      .filter((reference: string) => reference.startsWith('DocumentReference/'))
      .map((reference: string) => reference.split('/').pop() || '')
      .filter((id: string) => !!id);
  }

  attachmentTitle(document: DocumentReferenceResource): string {
    return (
      document.content?.[0]?.attachment?.title ||
      document.description ||
      `DocumentReference/${document.id}`
    );
  }

  linkedDocsCount(appointment: Appointment): number {
    return this.getDocumentReferenceIdsFromAppointment(appointment).length;
  }

  canOpenDocument(document: DocumentReferenceResource): boolean {
    return !!this.extractBinaryId(document);
  }

  openPdfDocument(document: DocumentReferenceResource): void {
    const binaryId = this.extractBinaryId(document);
    if (!binaryId) {
      this.errorMessage = 'No Binary ID found for this document.';
      return;
    }

    this.errorMessage = '';
    this.appointmentService.getBinaryById(binaryId).subscribe({
      next: (binary) => {
        const fileData = (binary as BinaryResource).data || '';
        if (!fileData) {
          this.errorMessage = `Binary/${binaryId} has no data payload.`;
          return;
        }

        const contentType =
          (binary as BinaryResource).contentType ||
          document.content?.[0]?.attachment?.contentType ||
          'application/pdf';

        const bytes = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        window.open(blobUrl, '_blank', 'noopener,noreferrer');

        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      },
      error: (error) => {
        this.errorMessage = `Failed to open PDF: ${error.message}`;
      },
    });
  }

  private extractBinaryId(document: DocumentReferenceResource): string {
    const url = document.content?.[0]?.attachment?.url || '';
    if (!url) return '';

    const marker = 'Binary/';
    const index = url.indexOf(marker);
    if (index < 0) return '';

    return url.slice(index + marker.length).trim();
  }
}
