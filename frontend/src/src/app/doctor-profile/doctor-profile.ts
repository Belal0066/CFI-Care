import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// export interface DoctorProfile {
//   name: string; specialty: string; affiliation: string;
//   yearsExperience: number; languages: string[]; bio: string;
//   email: string; phone: string; avatarInitials: string; avatarColor: string;
// }

// export interface Appointment {
//   id: number; patientName: string; type: string;
//   startHour: number; durationMinutes: number;
//   status: 'scheduled' | 'completed' | 'cancelled'; day: number;
// }

// export interface ActivityItem { patientName: string; action: string; time: string; }



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
  styleUrls: ['./doctor-profile.css']
})
export class DoctorProfileComponent implements OnInit {
  ngOnInit(): void {
    this.newSlot.scheduleId = this.schedules[0]?.id ?? '';
  }
  // profile: DoctorProfile | null = null;
  // isCreatingProfile = false;
  // isEditingProfile = false;
  // sidebarCollapsed = false;
  // currentView: 'week' | 'day' = 'week';
  // searchQuery = '';
  // showAddModal = false;
  // detailAppt: Appointment | null = null;

  // profileDraft: Partial<DoctorProfile> & { languages: string[] } = { languages: [] };
  // newAppt: Partial<Appointment> = { durationMinutes: 30, startHour: 9, day: 0 };

  // readonly hours = [8,9,10,11,12,13,14,15,16,17,18];
  // readonly days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // // Today is Sunday March 15 2026 → getDay()=0 → index 6
  // get todayIndex(): number {
  //   const d = new Date().getDay(); // 0=Sun,1=Mon...6=Sat
  //   return d === 0 ? 6 : d - 1;   // shift so Mon=0,Tue=1,...Sun=6
  // }

  // appointments: Appointment[] = [
  //   { id:1, patientName:'Sarah Mitchell', type:'Follow-up',    startHour:9,  durationMinutes:30, status:'scheduled', day:6 },
  //   { id:2, patientName:'James Okafor',   type:'Consultation', startHour:10, durationMinutes:60, status:'scheduled', day:6 },
  //   { id:3, patientName:'Priya Nair',     type:'Check-up',     startHour:14, durationMinutes:45, status:'completed', day:6 },
  //   { id:4, patientName:'Carlos Mendez',  type:'New Patient',  startHour:11, durationMinutes:60, status:'cancelled', day:1 },
  //   { id:5, patientName:'Layla Hassan',   type:'Follow-up',    startHour:16, durationMinutes:30, status:'scheduled', day:2 },
  //   { id:6, patientName:'David Chen',     type:'Lab Review',   startHour:8,  durationMinutes:30, status:'completed', day:3 },
  // ];

  // recentActivity: ActivityItem[] = [
  //   { patientName:'Priya Nair',     action:'Record viewed',     time:'2 min ago' },
  //   { patientName:'James Okafor',   action:'Notes updated',     time:'1 hr ago'  },
  //   { patientName:'Sarah Mitchell', action:'Lab results added', time:'Yesterday' },
  // ];

  // private weekOffset = 0;

  // get todayAppointments(): Appointment[] {
  //   return this.appointments.filter(a => a.day === this.todayIndex && a.status !== 'cancelled');
  // }

  // get upcomingCount(): number {
  //   return this.appointments.filter(a => a.status === 'scheduled').length;
  // }

  // ngOnInit(): void {
  //   const saved = localStorage.getItem('medflow_doctor_profile');
  //   if (saved) {
  //     try { this.profile = JSON.parse(saved); }
  //     catch { this.beginCreate(); }
  //   } else {
  //     this.beginCreate();
  //   }
  // }

  // private beginCreate(): void {
  //   this.isCreatingProfile = true;
  //   this.profileDraft = { name:'', specialty:'', affiliation:'', yearsExperience:0, languages:[], bio:'', email:'', phone:'' };
  // }

  // saveNewProfile(): void {
  //   if (!this.profileDraft.name?.trim() || !this.profileDraft.specialty?.trim()) return;
  //   this.profile = this.buildProfile(this.profileDraft);
  //   localStorage.setItem('medflow_doctor_profile', JSON.stringify(this.profile));
  //   this.isCreatingProfile = false;
  // }

  // editProfile(): void {
  //   if (!this.profile) return;
  //   this.profileDraft = { ...this.profile, languages: [...this.profile.languages] };
  //   this.isEditingProfile = true;
  // }

  // saveEdit(): void {
  //   if (!this.profileDraft.name?.trim() || !this.profileDraft.specialty?.trim()) return;
  //   this.profile = this.buildProfile(this.profileDraft);
  //   localStorage.setItem('medflow_doctor_profile', JSON.stringify(this.profile));
  //   this.isEditingProfile = false;
  // }

  // closeEdit(): void { this.isEditingProfile = false; }

  // private buildProfile(d: Partial<DoctorProfile> & { languages: string[] }): DoctorProfile {
  //   const initials = (d.name ?? '').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0,2).join('');
  //   return {
  //     name: d.name ?? '', specialty: d.specialty ?? '', affiliation: d.affiliation ?? '',
  //     yearsExperience: d.yearsExperience ?? 0, languages: [...(d.languages ?? [])],
  //     bio: d.bio ?? '', email: d.email ?? '', phone: d.phone ?? '',
  //     avatarInitials: initials, avatarColor: d.avatarColor ?? '#2F6FED',
  //   };
  // }

  // onLangInput(event: Event): void {
  //   const el = event.target as HTMLInputElement;
  //   if (el.value.endsWith(',')) {
  //     const lang = el.value.slice(0, -1).trim();
  //     if (lang && !this.profileDraft.languages.includes(lang))
  //       this.profileDraft.languages = [...this.profileDraft.languages, lang];
  //     el.value = '';
  //   }
  // }

  // removeLang(lang: string): void {
  //   this.profileDraft.languages = this.profileDraft.languages.filter(l => l !== lang);
  // }

  // getWeekLabel(): string {
  //   const now = new Date();
  //   now.setDate(now.getDate() + this.weekOffset * 7);
  //   const mon = new Date(now);
  //   mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  //   const sun = new Date(mon);
  //   sun.setDate(mon.getDate() + 6);
  //   const fmt = (d: Date) => d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  //   return `${fmt(mon)} – ${fmt(sun)}`;
  // }

  // prevWeek(): void { this.weekOffset--; }
  // nextWeek(): void { this.weekOffset++; }
  // goToday():  void { this.weekOffset = 0; }

  // slotsFor(dayIndex: number, hour: number): Appointment[] {
  //   const q = this.searchQuery.toLowerCase();
  //   return this.appointments.filter(a =>
  //     a.day === dayIndex && a.startHour === hour &&
  //     (!q || a.patientName.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))
  //   );
  // }

  // apptHeight(a: Appointment): number {
  //   return Math.max((a.durationMinutes / 60) * 56, 24);
  // }

  // fmtHour(h: number): string {
  //   if (h === 12) return '12:00 PM';
  //   return h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`;
  // }

  // trackById(_: number, a: Appointment): number { return a.id; }

  // openAdd(): void {
  //   this.newAppt = { durationMinutes: 30, startHour: 9, day: 0 };
  //   this.showAddModal = true;
  // }

  // saveAppt(): void {
  //   if (!this.newAppt.patientName?.trim() || !this.newAppt.type?.trim()) return;
  //   this.appointments = [...this.appointments, {
  //     id: Date.now(),
  //     patientName:     this.newAppt.patientName!,
  //     type:            this.newAppt.type!,
  //     startHour:       this.newAppt.startHour ?? 9,
  //     durationMinutes: this.newAppt.durationMinutes ?? 30,
  //     status:          'scheduled',
  //     day:             Number(this.newAppt.day ?? 0),
  //   }];
  //   this.showAddModal = false;
  // }

  // openDetail(appt: Appointment, e: Event): void {
  //   e.stopPropagation();
  //   this.detailAppt = { ...appt };
  // }

  // setStatus(status: 'scheduled' | 'completed' | 'cancelled'): void {
  //   if (!this.detailAppt) return;
  //   const id = this.detailAppt.id;
  //   this.appointments = this.appointments.map(a => a.id === id ? { ...a, status } : a);
  //   this.detailAppt = { ...this.detailAppt, status };
  // }

  // closeAdd():    void { this.showAddModal = false; }
  // closeDetail(): void { this.detailAppt = null; }






  schedules: Schedule[] = [
    { id:'SCH-001', active:true, start:'2026-04-01T08:00', end:'2026-04-30T18:00' },
    { id:'SCH-002', active:true, start:'2026-04-15T09:00', end:'2026-04-20T17:00' },
  ];

  slots: Slot[] = [
    { id:'SLT-001', scheduleId:'SCH-001', status:'free', start:'2026-04-25T09:00', end:'2026-04-25T09:30' },
    { id:'SLT-002', scheduleId:'SCH-001', status:'busy', start:'2026-04-25T09:30', end:'2026-04-25T10:00' },
    { id:'SLT-003', scheduleId:'SCH-002', status:'free', start:'2026-04-25T10:00', end:'2026-04-25T10:30' },
  ];


  showSchedForm = false;
  showEditModal = false;

  profile = {
    name: 'Dr. Sara Al-Rashidi',
    title: 'Senior Cardiologist',
    specialty: 'Interventional Cardiology',
    address: 'Riyadh, Building C · Floor 3',
    phone: '+966 50 123 4567',
    hospitals: ['MedFlow Hospital'] as string[],
  };

  editDraft = {
    name: 'Dr. Sara Al-Rashidi',
    title: 'Senior Cardiologist',
    specialty: 'Interventional Cardiology',
    address: 'Riyadh, Building C · Floor 3',
    phone: '+966 50 123 4567',
    hospitals: ['MedFlow Hospital'] as string[],
    newHospital: '',
  };

  get initials(): string {
    const parts = this.profile.name.split(' ').filter(Boolean);
    return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
  }

  saveProfile(): void {
    this.profile.name      = this.editDraft.name;
    this.profile.title     = this.editDraft.title;
    this.profile.specialty = this.editDraft.specialty;
    this.profile.address   = this.editDraft.address;
    this.profile.phone     = this.editDraft.phone;
    this.profile.hospitals = [...this.editDraft.hospitals];
    this.showEditModal     = false;
  }

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


  addHospital(): void {
    const h = this.editDraft.newHospital.trim();
    if (h && !this.editDraft.hospitals.includes(h)) {
      this.editDraft.hospitals = [...this.editDraft.hospitals, h];
    }
    this.editDraft.newHospital = '';
  }

  removeHospital(h: string): void {
    this.editDraft.hospitals = this.editDraft.hospitals.filter(x => x !== h);
  }

  currentFilter: 'all' | 'free' | 'busy' | 'busy-unavailable' = 'all';

  newSchedule = { start: '', end: '', active: true };
  newSlot = { start: '', end: '', status: 'free' as Slot['status'], scheduleId: '' };

  /* ========================= */
  /* GETTERS */
  /* ========================= */

  get filteredSlots(): Slot[] {
    if (this.currentFilter === 'all') return this.slots;
    return this.slots.filter(s => s.status === this.currentFilter);
  }

  get unavailableCount() {
    return this.slots.filter(s => s.status === 'busy-unavailable').length;
  }

  get freeCount() {
    return this.slots.filter(s => s.status === 'free').length;
  }

  get busyCount() {
    return this.slots.filter(s => s.status === 'busy').length;
  }

  /* ========================= */
  /* SCHEDULE ACTIONS */
  /* ========================= */

  scheduleError = '';

  createSchedule(): void {
    this.scheduleError = '';
    if (!this.newSchedule.start || !this.newSchedule.end) {
      this.scheduleError = 'Both dates are required.'; return;
    }
    if (new Date(this.newSchedule.end) <= new Date(this.newSchedule.start)) {
      this.scheduleError = 'End must be after start.'; return;
    }
    this.schedules.push({
      id: 'SCH-' + (this.schedules.length + 1).toString().padStart(3, '0'),
      active: this.newSchedule.active,
      start: this.newSchedule.start,
      end: this.newSchedule.end,
    });
    this.newSchedule = { start: '', end: '', active: true };
    this.showSchedForm = false;
  }
  
  editingSchedule: (Schedule & { _index: number }) | null = null;
  scheduleEditError = '';

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
    this.schedules = this.schedules.map((orig, i) => i === _index ? s : orig);
    // Re-validate any slots that now fall outside the updated schedule window
    this.slots = this.slots.map(slot =>
      slot.scheduleId === s.id && !this.slotFitsSchedule(slot, s)
        ? { ...slot, status: 'busy-unavailable' }
        : slot
    );
    this.editingSchedule = null;
  }

  deleteSchedule(i: number): void {
    const id = this.schedules[i].id;
    if (!confirm(`Delete schedule ${id}? All its slots will also be deleted.`)) return;
    this.schedules = this.schedules.filter((_, idx) => idx !== i);
    this.slots = this.slots.filter(s => s.scheduleId !== id);
  }

  deleteSlot(id: string): void {
    if (!confirm(`Delete slot ${id}?`)) return;
    this.slots = this.slots.filter(s => s.id !== id);
  }

  /* ========================= */
  /* SLOT ACTIONS */
  /* ========================= */

  slotError = '';

  createSlot(): void {
    this.slotError = '';
    if (!this.newSlot.start || !this.newSlot.end || !this.newSlot.scheduleId) {
      this.slotError = 'All fields are required.'; return;
    }
    if (new Date(this.newSlot.end) <= new Date(this.newSlot.start)) {
      this.slotError = 'End must be after start.'; return;
    }
    const sched = this.schedules.find(s => s.id === this.newSlot.scheduleId);
    if (sched && !this.slotFitsSchedule(this.newSlot, sched)) {
      this.slotError = `Slot must be within ${this.fmt(sched.start)} → ${this.fmt(sched.end)}.`; return;
    }
    this.slots.push({
      id: 'SLT-' + (this.slots.length + 1).toString().padStart(3, '0'),
      scheduleId: this.newSlot.scheduleId,
      status: this.newSlot.status,
      start: this.newSlot.start,
      end: this.newSlot.end,
    });
    this.newSlot = { start: '', end: '', status: 'free', scheduleId: this.newSlot.scheduleId };
  }

  private slotFitsSchedule(slot: { start: string; end: string }, sched: Schedule): boolean {
    return new Date(slot.start) >= new Date(sched.start) &&
          new Date(slot.end) <= new Date(sched.end);
  }

  /* ========================= */
  /* FILTER */
  /* ========================= */

  setFilter(filter: 'all' | 'free' | 'busy' | 'busy-unavailable') {
    this.currentFilter = filter;
  }

  /* ========================= */
  /* UTIL */
  /* ========================= */

  fmt(date: string) {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }


}