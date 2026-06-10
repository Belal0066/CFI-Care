import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import {
  AppointmentService,
  Practitioner,
  Schedule,
  Slot,
} from '../services/appointment/appointment.service';

@Component({
  selector: 'app-practitioner-profile-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practitioner-profile-test.component.html',
  styleUrl: './practitioner-profile-test.component.css',
})
export class PractitionerProfileTestComponent implements OnInit {
  practitionerId = '';
  practitioner: Practitioner | null = null;
  practitionerRoleId = '';
  practitionerRole: any = null;
  schedules: Schedule[] = [];
  slots: Slot[] = [];

  loading = false;
  savingProfile = false;
  savingSchedule = false;
  savingSlot = false;

  message = '';
  errorMessage = '';
  highlightedSlotId = '';

  // Getter for filtered slots based on selected schedule
  get filteredSlots(): Slot[] {
    if (!this.newSlotForm.scheduleId) {
      return this.slots;
    }

    return this.slots.filter(
      (slot) =>
        slot.schedule.reference === `Schedule/${this.newSlotForm.scheduleId}` ||
        slot.schedule.reference === this.newSlotForm.scheduleId,
    );
  }

  profileForm = {
    name: '',
    title: '',
    specialtyDetail: '',
    address: '',
    imageUrl: '',
  };

  newScheduleForm = {
    startDate: '',
    endDate: '',
    active: true,
  };

  newSlotForm = {
    scheduleId: '',
    startDateTime: '',
    endDateTime: '',
    status: 'free',
  };

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.highlightedSlotId = params.get('highlightSlotId') || '';
    });

    this.loadSignedPractitionerProfile();
  }

  loadSignedPractitionerProfile(): void {
    this.loading = true;
    this.errorMessage = '';
    this.message = '';

    this.authService.checkAuthStatus().subscribe({
      next: (auth) => {
        if (!auth.authenticated || !auth.user?.sub) {
          this.loading = false;
          this.errorMessage = 'Not authenticated. Please login first.';
          return;
        }

        this.practitionerId = auth.user.sub;
        this.loadAllPractitionerData();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = `Failed to verify session: ${error.message}`;
      },
    });
  }

  loadAllPractitionerData(): void {
    if (!this.practitionerId) {
      this.loading = false;
      this.errorMessage = 'Missing signed practitioner id.';
      return;
    }

    this.appointmentService.getPractitionerById(this.practitionerId).subscribe({
      next: (practitioner) => {
        this.practitioner = practitioner;
        this.profileForm = {
          name: practitioner.name || '',
          title: practitioner.title || '',
          specialtyDetail:
            practitioner.specialtyDetail || practitioner.specialty || '',
          address: practitioner.address || '',
          imageUrl: practitioner.imageUrl || '',
        };

        this.loadPractitionerRole();
        this.loadSchedules();
        this.loadSlots();
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = `Failed to load practitioner profile: ${error.message}`;
      },
    });
  }

  loadSchedules(): void {
    this.appointmentService
      .getSchedulesByPractitioner(this.practitionerId)
      .subscribe({
        next: (data) => {
          this.schedules = data || [];
          if (!this.newSlotForm.scheduleId && this.schedules.length > 0) {
            this.newSlotForm.scheduleId = this.schedules[0].id;
          }
          this.loading = false;
        },
        error: (error) => {
          this.loading = false;
          this.errorMessage = `Failed to load schedules: ${error.message}`;
        },
      });
  }

  loadSlots(): void {
    this.appointmentService
      .getSlotsByPractitioner(this.practitionerId)
      .subscribe({
        next: (data) => {
          this.slots = data || [];

          if (this.highlightedSlotId) {
            const targetSlot = this.slots.find(
              (slot) => slot.id === this.highlightedSlotId,
            );

            if (targetSlot) {
              const scheduleRef = targetSlot.schedule?.reference || '';
              const scheduleId = scheduleRef.includes('/')
                ? scheduleRef.split('/').pop() || ''
                : scheduleRef;

              if (scheduleId) {
                this.newSlotForm.scheduleId = scheduleId;
              }

              setTimeout(() => {
                document
                  .getElementById(`slot-row-${targetSlot.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 0);
            }
          }
        },
        error: (error) => {
          this.errorMessage = `Failed to load slots: ${error.message}`;
        },
      });
  }

  isHighlightedSlot(slot: Slot): boolean {
    return !!this.highlightedSlotId && slot.id === this.highlightedSlotId;
  }

  loadPractitionerRole(): void {
    this.appointmentService
      .getPractitionerRolesByPractitioner(this.practitionerId)
      .subscribe({
        next: (bundle) => {
          if (bundle.entry && bundle.entry.length > 0) {
            this.practitionerRole = bundle.entry[0].resource;
            this.practitionerRoleId = this.practitionerRole.id;
          }
        },
        error: (error) => {
          console.warn('Failed to load practitioner role:', error.message);
        },
      });
  }

  saveProfile(): void {
    if (!this.practitionerId || !this.practitioner) {
      this.errorMessage = 'Practitioner profile not loaded yet.';
      return;
    }

    this.savingProfile = true;
    this.errorMessage = '';

    // Build FHIR-compliant Practitioner resource (only valid FHIR fields)
    const payload: any = {
      resourceType: 'Practitioner',
      id: this.practitionerId,
    };

    // Only include fields that exist in original FHIR resource
    if ((this.practitioner as any).meta) {
      payload.meta = (this.practitioner as any).meta;
    }
    if ((this.practitioner as any).active !== undefined) {
      payload.active = (this.practitioner as any).active;
    }

    // Set name
    payload.name = [
      {
        use: 'official',
        text: this.profileForm.name,
        given: this.profileForm.name
          .split(' ')
          .filter((part: string) => !!part.trim())
          .slice(0, -1),
        family: this.profileForm.name.split(' ').slice(-1)[0] || '',
      },
    ];

    // Set address if provided
    if (this.profileForm.address) {
      payload.address = [{ text: this.profileForm.address }];
    }

    // Set photo if provided
    if (this.profileForm.imageUrl) {
      payload.photo = [{ url: this.profileForm.imageUrl }];
    }

    // Include other valid FHIR fields if they exist
    if ((this.practitioner as any).telecom) {
      payload.telecom = (this.practitioner as any).telecom;
    }
    if ((this.practitioner as any).gender) {
      payload.gender = (this.practitioner as any).gender;
    }
    if ((this.practitioner as any).birthDate) {
      payload.birthDate = (this.practitioner as any).birthDate;
    }
    if ((this.practitioner as any).qualification) {
      payload.qualification = (this.practitioner as any).qualification;
    }
    if ((this.practitioner as any).communication) {
      payload.communication = (this.practitioner as any).communication;
    }

    this.appointmentService
      .updatePractitioner(this.practitionerId, payload)
      .subscribe({
        next: () => {
          // Also update PractitionerRole if it exists
          if (this.practitionerRoleId && this.practitionerRole) {
            this.updatePractitionerRoleFields();
          } else {
            this.savingProfile = false;
            this.message = 'Profile updated successfully.';
            this.loadAllPractitionerData();
          }
        },
        error: (error) => {
          this.savingProfile = false;
          this.errorMessage = `Failed to update profile: ${error.error?.error || error.message}`;
        },
      });
  }

  updatePractitionerRoleFields(): void {
    const rolePayload = {
      resourceType: 'PractitionerRole',
      id: this.practitionerRoleId,
      active: this.practitionerRole.active,
      practitioner: this.practitionerRole.practitioner,
      code: [
        {
          text: this.profileForm.title,
        },
      ],
      specialty: [
        {
          text: this.profileForm.specialtyDetail,
        },
      ],
    };

    this.appointmentService
      .updatePractitionerRole(this.practitionerRoleId, rolePayload)
      .subscribe({
        next: () => {
          this.savingProfile = false;
          this.message = 'Profile and role updated successfully.';
          this.loadAllPractitionerData();
        },
        error: (error) => {
          this.savingProfile = false;
          this.errorMessage = `Profile updated but role update failed: ${error.error?.error || error.message}`;
        },
      });
  }

  createSchedule(): void {
    if (!this.practitionerId) {
      this.errorMessage = 'Missing practitioner ID.';
      return;
    }

    if (!this.newScheduleForm.startDate || !this.newScheduleForm.endDate) {
      this.errorMessage = 'Please provide schedule start and end date.';
      return;
    }

    this.savingSchedule = true;
    this.errorMessage = '';

    const scheduleData = {
      resourceType: 'Schedule',
      active: this.newScheduleForm.active,
      actor: [{ reference: `Practitioner/${this.practitionerId}` }],
      planningHorizon: {
        start: new Date(this.newScheduleForm.startDate).toISOString(),
        end: new Date(this.newScheduleForm.endDate).toISOString(),
      },
    };

    this.appointmentService.createSchedule(scheduleData).subscribe({
      next: (newSchedule) => {
        this.savingSchedule = false;
        this.message = 'Schedule created successfully.';
        this.newScheduleForm = { startDate: '', endDate: '', active: true };
        // Optimistic update: push directly from response so it appears instantly
        // without waiting for FHIR search index to catch up
        this.schedules = [...this.schedules, newSchedule];
        if (!this.newSlotForm.scheduleId && newSchedule.id) {
          this.newSlotForm.scheduleId = newSchedule.id;
        }
      },
      error: (error) => {
        this.savingSchedule = false;
        this.errorMessage = `Failed to create schedule: ${error.error?.error || error.message}`;
      },
    });
  }

  createSlot(): void {
    if (!this.newSlotForm.scheduleId) {
      this.errorMessage = 'Please select a schedule.';
      return;
    }

    if (!this.newSlotForm.startDateTime || !this.newSlotForm.endDateTime) {
      this.errorMessage = 'Please provide slot start and end time.';
      return;
    }

    this.savingSlot = true;
    this.errorMessage = '';

    const slotData = {
      resourceType: 'Slot',
      schedule: { reference: `Schedule/${this.newSlotForm.scheduleId}` },
      status: this.newSlotForm.status,
      start: new Date(this.newSlotForm.startDateTime).toISOString(),
      end: new Date(this.newSlotForm.endDateTime).toISOString(),
    };

    this.appointmentService.createSlot(slotData).subscribe({
      next: (newSlot) => {
        this.savingSlot = false;
        this.message = 'Slot created successfully.';
        this.newSlotForm = {
          scheduleId: this.newSlotForm.scheduleId,
          startDateTime: '',
          endDateTime: '',
          status: 'free',
        };
        // Optimistic update: push directly from response so it appears instantly
        // without waiting for FHIR search index to catch up
        this.slots = [...this.slots, newSlot];
      },
      error: (error) => {
        this.savingSlot = false;
        this.errorMessage = `Failed to create slot: ${error.error?.error || error.message}`;
      },
    });
  }

  updateSchedule(schedule: Schedule): void {
    this.errorMessage = '';
    this.message = '';

    this.appointmentService.updateSchedule(schedule.id, schedule).subscribe({
      next: () => {
        this.message = `Schedule ${schedule.id} updated.`;
      },
      error: (error) => {
        this.errorMessage = `Failed to update schedule ${schedule.id}: ${error.error?.error || error.message}`;
      },
    });
  }

  updateSlot(slot: Slot): void {
    this.errorMessage = '';
    this.message = '';

    this.appointmentService.updateSlot(slot.id, slot).subscribe({
      next: () => {
        this.message = `Slot ${slot.id} updated.`;
      },
      error: (error) => {
        this.errorMessage = `Failed to update slot ${slot.id}: ${error.error?.error || error.message}`;
      },
    });
  }

  openSlotAppointmentTest(slot: Slot): void {
    this.router.navigate(['/slot-appointment-test'], {
      queryParams: {
        slotId: slot.id,
        practitionerId: this.practitionerId,
      },
    });
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  }
}
