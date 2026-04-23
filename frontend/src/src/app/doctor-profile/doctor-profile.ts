import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DoctorProfile {
  name: string; specialty: string; affiliation: string;
  yearsExperience: number; languages: string[]; bio: string;
  email: string; phone: string; avatarInitials: string; avatarColor: string;
}

export interface Appointment {
  id: number; patientName: string; type: string;
  startHour: number; durationMinutes: number;
  status: 'scheduled' | 'completed' | 'cancelled'; day: number;
}

export interface ActivityItem { patientName: string; action: string; time: string; }

@Component({
  selector: 'app-doctor-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './doctor-profile.html',
  styleUrls: ['./doctor-profile.css']
})
export class DoctorProfileComponent implements OnInit {

  profile: DoctorProfile | null = null;
  isCreatingProfile = false;
  isEditingProfile = false;
  sidebarCollapsed = false;
  currentView: 'week' | 'day' = 'week';
  searchQuery = '';
  showAddModal = false;
  detailAppt: Appointment | null = null;

  profileDraft: Partial<DoctorProfile> & { languages: string[] } = { languages: [] };
  newAppt: Partial<Appointment> = { durationMinutes: 30, startHour: 9, day: 0 };

  readonly hours = [8,9,10,11,12,13,14,15,16,17,18];
  readonly days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // Today is Sunday March 15 2026 → getDay()=0 → index 6
  get todayIndex(): number {
    const d = new Date().getDay(); // 0=Sun,1=Mon...6=Sat
    return d === 0 ? 6 : d - 1;   // shift so Mon=0,Tue=1,...Sun=6
  }

  appointments: Appointment[] = [
    { id:1, patientName:'Sarah Mitchell', type:'Follow-up',    startHour:9,  durationMinutes:30, status:'scheduled', day:6 },
    { id:2, patientName:'James Okafor',   type:'Consultation', startHour:10, durationMinutes:60, status:'scheduled', day:6 },
    { id:3, patientName:'Priya Nair',     type:'Check-up',     startHour:14, durationMinutes:45, status:'completed', day:6 },
    { id:4, patientName:'Carlos Mendez',  type:'New Patient',  startHour:11, durationMinutes:60, status:'cancelled', day:1 },
    { id:5, patientName:'Layla Hassan',   type:'Follow-up',    startHour:16, durationMinutes:30, status:'scheduled', day:2 },
    { id:6, patientName:'David Chen',     type:'Lab Review',   startHour:8,  durationMinutes:30, status:'completed', day:3 },
  ];

  recentActivity: ActivityItem[] = [
    { patientName:'Priya Nair',     action:'Record viewed',     time:'2 min ago' },
    { patientName:'James Okafor',   action:'Notes updated',     time:'1 hr ago'  },
    { patientName:'Sarah Mitchell', action:'Lab results added', time:'Yesterday' },
  ];

  private weekOffset = 0;

  get todayAppointments(): Appointment[] {
    return this.appointments.filter(a => a.day === this.todayIndex && a.status !== 'cancelled');
  }

  get upcomingCount(): number {
    return this.appointments.filter(a => a.status === 'scheduled').length;
  }

  ngOnInit(): void {
    const saved = localStorage.getItem('medflow_doctor_profile');
    if (saved) {
      try { this.profile = JSON.parse(saved); }
      catch { this.beginCreate(); }
    } else {
      this.beginCreate();
    }
  }

  private beginCreate(): void {
    this.isCreatingProfile = true;
    this.profileDraft = { name:'', specialty:'', affiliation:'', yearsExperience:0, languages:[], bio:'', email:'', phone:'' };
  }

  saveNewProfile(): void {
    if (!this.profileDraft.name?.trim() || !this.profileDraft.specialty?.trim()) return;
    this.profile = this.buildProfile(this.profileDraft);
    localStorage.setItem('medflow_doctor_profile', JSON.stringify(this.profile));
    this.isCreatingProfile = false;
  }

  editProfile(): void {
    if (!this.profile) return;
    this.profileDraft = { ...this.profile, languages: [...this.profile.languages] };
    this.isEditingProfile = true;
  }

  saveEdit(): void {
    if (!this.profileDraft.name?.trim() || !this.profileDraft.specialty?.trim()) return;
    this.profile = this.buildProfile(this.profileDraft);
    localStorage.setItem('medflow_doctor_profile', JSON.stringify(this.profile));
    this.isEditingProfile = false;
  }

  closeEdit(): void { this.isEditingProfile = false; }

  private buildProfile(d: Partial<DoctorProfile> & { languages: string[] }): DoctorProfile {
    const initials = (d.name ?? '').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0,2).join('');
    return {
      name: d.name ?? '', specialty: d.specialty ?? '', affiliation: d.affiliation ?? '',
      yearsExperience: d.yearsExperience ?? 0, languages: [...(d.languages ?? [])],
      bio: d.bio ?? '', email: d.email ?? '', phone: d.phone ?? '',
      avatarInitials: initials, avatarColor: d.avatarColor ?? '#2F6FED',
    };
  }

  onLangInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (el.value.endsWith(',')) {
      const lang = el.value.slice(0, -1).trim();
      if (lang && !this.profileDraft.languages.includes(lang))
        this.profileDraft.languages = [...this.profileDraft.languages, lang];
      el.value = '';
    }
  }

  removeLang(lang: string): void {
    this.profileDraft.languages = this.profileDraft.languages.filter(l => l !== lang);
  }

  getWeekLabel(): string {
    const now = new Date();
    now.setDate(now.getDate() + this.weekOffset * 7);
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `${fmt(mon)} – ${fmt(sun)}`;
  }

  prevWeek(): void { this.weekOffset--; }
  nextWeek(): void { this.weekOffset++; }
  goToday():  void { this.weekOffset = 0; }

  slotsFor(dayIndex: number, hour: number): Appointment[] {
    const q = this.searchQuery.toLowerCase();
    return this.appointments.filter(a =>
      a.day === dayIndex && a.startHour === hour &&
      (!q || a.patientName.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))
    );
  }

  apptHeight(a: Appointment): number {
    return Math.max((a.durationMinutes / 60) * 56, 24);
  }

  fmtHour(h: number): string {
    if (h === 12) return '12:00 PM';
    return h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`;
  }

  trackById(_: number, a: Appointment): number { return a.id; }

  openAdd(): void {
    this.newAppt = { durationMinutes: 30, startHour: 9, day: 0 };
    this.showAddModal = true;
  }

  saveAppt(): void {
    if (!this.newAppt.patientName?.trim() || !this.newAppt.type?.trim()) return;
    this.appointments = [...this.appointments, {
      id: Date.now(),
      patientName:     this.newAppt.patientName!,
      type:            this.newAppt.type!,
      startHour:       this.newAppt.startHour ?? 9,
      durationMinutes: this.newAppt.durationMinutes ?? 30,
      status:          'scheduled',
      day:             Number(this.newAppt.day ?? 0),
    }];
    this.showAddModal = false;
  }

  openDetail(appt: Appointment, e: Event): void {
    e.stopPropagation();
    this.detailAppt = { ...appt };
  }

  setStatus(status: 'scheduled' | 'completed' | 'cancelled'): void {
    if (!this.detailAppt) return;
    const id = this.detailAppt.id;
    this.appointments = this.appointments.map(a => a.id === id ? { ...a, status } : a);
    this.detailAppt = { ...this.detailAppt, status };
  }

  closeAdd():    void { this.showAddModal = false; }
  closeDetail(): void { this.detailAppt = null; }
}