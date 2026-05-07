import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth/auth.service';
import { AppointmentService } from '../services/appointment/appointment.service';

interface Schedule {
  id: string;
  active: boolean;
  start: string;
  end: string;
}

interface Slot {
  id: string;
  scheduleId: string;
  status: 'free' | 'busy' | 'busy-unavailable';
  start: string;
  end: string;
}

@Component({
  selector: 'app-doctor-profile',
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './doctor-profile.html',
  styleUrls: ['./doctor-profile.css'],
})
export class DoctorProfileComponent implements OnInit {
  private practitionerId = '';
  private practitionerRoleId = '';
  private rawPractitioner: any = null;
  private rawRole: any = null;

  loading = false;
  saving = false;
  message = '';
  errorMessage = '';

  schedules: Schedule[] = [];
  slots: Slot[] = [];

  showSchedForm = false;
  showEditModal = false;
  currentFilter: 'all' | 'free' | 'busy' | 'busy-unavailable' = 'all';

  profile = {
    name: '',
    title: '',
    specialty: '',
    address: '',
    phone: '',
    hospitals: [] as string[],
  };

  editDraft = {
    name: '',
    title: '',
    specialty: '',
    address: '',
    phone: '',
    hospitals: [] as string[],
    newHospital: '',
  };

  newSchedule = { start: '', end: '', active: true };
  newSlot = { start: '', end: '', status: 'free' as Slot['status'], scheduleId: '' };

  scheduleError = '';
  slotError = '';
  editingSchedule: (Schedule & { _index: number }) | null = null;
  scheduleEditError = '';

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.authService.checkAuthStatus().subscribe({
      next: (auth) => {
        if (!auth.authenticated || !auth.user?.sub) {
          this.loading = false;
          this.errorMessage = 'Not authenticated. Please login.';
          return;
        }
        this.practitionerId = auth.user.sub;
        this.loadAllData();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = `Auth check failed: ${err.message}`;
      },
    });
  }

  private loadAllData(): void {
    this.appointmentService.getPractitionerById(this.practitionerId).subscribe({
      next: (p: any) => {
        this.rawPractitioner = p;
        this.profile.name = p.name || '';
        this.profile.title = p.title || '';
        this.profile.specialty = p.specialtyDetail || p.specialty || '';
        this.profile.address = p.address || '';
        const telecomArr = Array.isArray(p.telecom) ? p.telecom : [];
        const phoneEntry = telecomArr.find((t: any) => t.system === 'phone');
        this.profile.phone = phoneEntry?.value || '';

        this.loadRole();
        this.loadSchedules();
        this.loadSlots();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = `Failed to load profile: ${err.message}`;
      },
    });
  }

  private loadRole(): void {
    this.appointmentService
      .getPractitionerRolesByPractitioner(this.practitionerId)
      .subscribe({
        next: (bundle: any) => {
          if (bundle?.entry?.length > 0) {
            this.rawRole = bundle.entry[0].resource;
            this.practitionerRoleId = this.rawRole.id;
            if (this.rawRole.code?.[0]?.text) this.profile.title = this.rawRole.code[0].text;
            if (this.rawRole.specialty?.[0]?.text) this.profile.specialty = this.rawRole.specialty[0].text;
          }
        },
        error: () => {},
      });
  }

  private loadSchedules(): void {
    this.appointmentService
      .getSchedulesByPractitioner(this.practitionerId)
      .subscribe({
        next: (data: any[]) => {
          this.schedules = (data || []).map((s) => this.mapSchedule(s));
          if (!this.newSlot.scheduleId && this.schedules.length > 0) {
            this.newSlot.scheduleId = this.schedules[0].id;
          }
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = `Failed to load schedules: ${err.message}`;
        },
      });
  }

  private loadSlots(): void {
    this.appointmentService
      .getSlotsByPractitioner(this.practitionerId)
      .subscribe({
        next: (data: any[]) => {
          this.slots = (data || []).map((s) => this.mapSlot(s));
        },
        error: () => {},
      });
  }

  private mapSchedule(s: any): Schedule {
    return {
      id: s.id,
      active: s.active ?? true,
      start: s.planningHorizon?.start || s.start || '',
      end: s.planningHorizon?.end || s.end || '',
    };
  }

  private mapSlot(s: any): Slot {
    const ref = s.schedule?.reference || '';
    const scheduleId = ref.includes('/') ? ref.split('/').pop()! : ref;
    return {
      id: s.id,
      scheduleId,
      status: s.status as Slot['status'],
      start: s.start || '',
      end: s.end || '',
    };
  }

  /* ========================= */
  /* GETTERS */
  /* ========================= */

  get initials(): string {
    const parts = this.profile.name.split(' ').filter(Boolean);
    return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
  }

  get filteredSlots(): Slot[] {
    if (this.currentFilter === 'all') return this.slots;
    return this.slots.filter((s) => s.status === this.currentFilter);
  }

  get unavailableCount(): number {
    return this.slots.filter((s) => s.status === 'busy-unavailable').length;
  }

  get freeCount(): number {
    return this.slots.filter((s) => s.status === 'free').length;
  }

  get busyCount(): number {
    return this.slots.filter((s) => s.status === 'busy').length;
  }

  get minDate(): string {
    return new Date().toISOString().slice(0, 16);
  }

  get maxDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 16);
  }

  /* ========================= */
  /* PROFILE */
  /* ========================= */

  openEditModal(): void {
    this.editDraft = {
      name: this.profile.name,
      title: this.profile.title,
      specialty: this.profile.specialty,
      address: this.profile.address,
      phone: this.profile.phone,
      hospitals: [...this.profile.hospitals],
      newHospital: '',
    };
    this.showEditModal = true;
  }

  saveProfile(): void {
    if (!this.practitionerId) return;
    this.saving = true;
    this.errorMessage = '';
    this.message = '';

    const payload: any = {
      resourceType: 'Practitioner',
      id: this.practitionerId,
    };
    if (this.rawPractitioner?.meta) payload.meta = this.rawPractitioner.meta;
    if (this.rawPractitioner?.active !== undefined) payload.active = this.rawPractitioner.active;
    if (this.rawPractitioner?.gender) payload.gender = this.rawPractitioner.gender;
    if (this.rawPractitioner?.birthDate) payload.birthDate = this.rawPractitioner.birthDate;
    if (this.rawPractitioner?.qualification) payload.qualification = this.rawPractitioner.qualification;
    if (this.rawPractitioner?.communication) payload.communication = this.rawPractitioner.communication;

    payload.name = [
      {
        use: 'official',
        text: this.editDraft.name,
        given: this.editDraft.name.split(' ').filter(Boolean).slice(0, -1),
        family: this.editDraft.name.split(' ').filter(Boolean).pop() || '',
      },
    ];
    if (this.editDraft.address) payload.address = [{ text: this.editDraft.address }];

    const existingTelecom: any[] = Array.isArray(this.rawPractitioner?.telecom)
      ? [...this.rawPractitioner.telecom]
      : [];
    const phoneIdx = existingTelecom.findIndex((t: any) => t.system === 'phone');
    if (this.editDraft.phone) {
      if (phoneIdx >= 0) existingTelecom[phoneIdx].value = this.editDraft.phone;
      else existingTelecom.push({ system: 'phone', value: this.editDraft.phone });
    }
    if (existingTelecom.length > 0) payload.telecom = existingTelecom;

    this.appointmentService.updatePractitioner(this.practitionerId, payload).subscribe({
      next: () => {
        this.profile.name = this.editDraft.name;
        this.profile.address = this.editDraft.address;
        this.profile.phone = this.editDraft.phone;
        this.profile.hospitals = [...this.editDraft.hospitals];
        if (this.practitionerRoleId && this.rawRole) {
          this.updateRole();
        } else {
          this.saving = false;
          this.message = 'Profile saved.';
          this.showEditModal = false;
        }
      },
      error: (err) => {
        this.saving = false;
        this.errorMessage = `Failed to save profile: ${err.error?.error || err.message}`;
      },
    });
  }

  private updateRole(): void {
    const rolePayload = {
      resourceType: 'PractitionerRole',
      id: this.practitionerRoleId,
      active: this.rawRole.active,
      practitioner: this.rawRole.practitioner,
      code: [{ text: this.editDraft.title }],
      specialty: [{ text: this.editDraft.specialty }],
    };
    this.appointmentService
      .updatePractitionerRole(this.practitionerRoleId, rolePayload)
      .subscribe({
        next: () => {
          this.profile.title = this.editDraft.title;
          this.profile.specialty = this.editDraft.specialty;
          this.saving = false;
          this.message = 'Profile saved.';
          this.showEditModal = false;
        },
        error: (err) => {
          this.saving = false;
          this.errorMessage = `Profile saved but role update failed: ${err.error?.error || err.message}`;
          this.showEditModal = false;
        },
      });
  }

  addHospital(): void {
    const h = this.editDraft.newHospital.trim();
    if (h && !this.editDraft.hospitals.includes(h)) {
      this.editDraft.hospitals = [...this.editDraft.hospitals, h];
    }
    this.editDraft.newHospital = '';
  }

  removeHospital(h: string): void {
    this.editDraft.hospitals = this.editDraft.hospitals.filter((x) => x !== h);
  }

  /* ========================= */
  /* SCHEDULE ACTIONS */
  /* ========================= */

  createSchedule(): void {
    this.scheduleError = '';
    if (!this.newSchedule.start || !this.newSchedule.end) {
      this.scheduleError = 'Both dates are required.';
      return;
    }
    if (new Date(this.newSchedule.end) <= new Date(this.newSchedule.start)) {
      this.scheduleError = 'End must be after start.';
      return;
    }

    const payload = {
      resourceType: 'Schedule',
      active: this.newSchedule.active,
      actor: [{ reference: `Practitioner/${this.practitionerId}` }],
      planningHorizon: {
        start: new Date(this.newSchedule.start).toISOString(),
        end: new Date(this.newSchedule.end).toISOString(),
      },
    };

    this.appointmentService.createSchedule(payload).subscribe({
      next: () => {
        this.newSchedule = { start: '', end: '', active: true };
        this.showSchedForm = false;
        this.message = 'Schedule created.';
        this.loadSchedules();
      },
      error: (err) => {
        this.scheduleError = `Failed to create schedule: ${err.error?.error || err.message}`;
      },
    });
  }

  editSchedule(i: number): void {
    this.scheduleEditError = '';
    this.editingSchedule = { ...this.schedules[i], _index: i };
  }

  saveScheduleEdit(): void {
    if (!this.editingSchedule) return;
    const { _index, ...s } = this.editingSchedule;
    if (new Date(s.end) <= new Date(s.start)) {
      this.scheduleEditError = 'End must be after start.';
      return;
    }

    const payload = {
      resourceType: 'Schedule',
      id: s.id,
      active: s.active,
      actor: [{ reference: `Practitioner/${this.practitionerId}` }],
      planningHorizon: {
        start: new Date(s.start).toISOString(),
        end: new Date(s.end).toISOString(),
      },
    };

    this.appointmentService.updateSchedule(s.id, payload).subscribe({
      next: () => {
        this.editingSchedule = null;
        this.message = 'Schedule updated.';
        this.loadSchedules();
      },
      error: (err) => {
        this.scheduleEditError = `Failed to update: ${err.error?.error || err.message}`;
      },
    });
  }

  deleteSchedule(i: number): void {
    const id = this.schedules[i].id;
    if (!confirm(`Delete schedule ${id}? All its slots will also be deleted.`)) return;
    this.appointmentService.deleteSchedule(id).subscribe({
      next: () => {
        this.message = 'Schedule deleted.';
        this.loadSchedules();
        this.loadSlots();
      },
      error: (err) => {
        this.errorMessage = `Failed to delete schedule: ${err.error?.error || err.message}`;
      },
    });
  }

  /* ========================= */
  /* SLOT ACTIONS */
  /* ========================= */

  createSlot(): void {
    this.slotError = '';
    if (!this.newSlot.start || !this.newSlot.end || !this.newSlot.scheduleId) {
      this.slotError = 'All fields are required.';
      return;
    }
    if (new Date(this.newSlot.end) <= new Date(this.newSlot.start)) {
      this.slotError = 'End must be after start.';
      return;
    }
    const sched = this.schedules.find((s) => s.id === this.newSlot.scheduleId);
    if (sched && !this.slotFitsSchedule(this.newSlot, sched)) {
      this.slotError = `Slot must be within ${this.fmt(sched.start)} → ${this.fmt(sched.end)}.`;
      return;
    }

    const payload = {
      resourceType: 'Slot',
      schedule: { reference: `Schedule/${this.newSlot.scheduleId}` },
      status: this.newSlot.status,
      start: new Date(this.newSlot.start).toISOString(),
      end: new Date(this.newSlot.end).toISOString(),
    };

    this.appointmentService.createSlot(payload).subscribe({
      next: () => {
        this.newSlot = { start: '', end: '', status: 'free', scheduleId: this.newSlot.scheduleId };
        this.message = 'Slot created.';
        this.loadSlots();
      },
      error: (err) => {
        this.slotError = `Failed to create slot: ${err.error?.error || err.message}`;
      },
    });
  }

  updateSlotStatus(slot: Slot): void {
    const payload = {
      resourceType: 'Slot',
      id: slot.id,
      schedule: { reference: `Schedule/${slot.scheduleId}` },
      status: slot.status,
      start: slot.start,
      end: slot.end,
    };
    this.appointmentService.updateSlot(slot.id, payload).subscribe({
      next: () => { this.message = 'Slot status updated.'; },
      error: () => {},
    });
  }

  deleteSlot(id: string): void {
    if (!confirm(`Delete slot ${id}?`)) return;
    this.appointmentService.deleteSlot(id).subscribe({
      next: () => {
        this.message = 'Slot deleted.';
        this.loadSlots();
      },
      error: (err) => {
        this.errorMessage = `Failed to delete slot: ${err.error?.error || err.message}`;
      },
    });
  }

  private slotFitsSchedule(slot: { start: string; end: string }, sched: Schedule): boolean {
    return (
      new Date(slot.start) >= new Date(sched.start) &&
      new Date(slot.end) <= new Date(sched.end)
    );
  }

  /* ========================= */
  /* FILTER / UTIL */
  /* ========================= */

  setFilter(filter: 'all' | 'free' | 'busy' | 'busy-unavailable'): void {
    this.currentFilter = filter;
  }

  fmt(date: string): string {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
