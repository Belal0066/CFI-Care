import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Users } from '../users/users';
import { NgOtpInputModule } from 'ng-otp-input';
import { PatientApiService } from '../services/patientApi/patient-api-service';
import { PatientSummaryDTO } from '../models/patient.model';

@Component({
  selector: 'app-users-panel',
  standalone: true,
  imports: [Users, CommonModule, FormsModule, NgOtpInputModule],
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.css',
})
export class UsersPanel implements OnInit {
  // Data State
  allPatients: PatientSummaryDTO[] = [];
  filteredPatients: PatientSummaryDTO[] = [];
  loading: boolean = true;
  error: string | null = null;

  // Search
  searchQuery: string = '';

  // Filter
  filterOpen: boolean = false;
  sortBy: string = 'name';
  ageMin: number = 0;
  ageMax: number = 120;

  // Modal & OTP
  modalOpen: boolean = false;
  otpValue: string = '';
  otpState:
    | 'idle'
    | 'loading'
    | 'success'
    | 'forwarded'
    | 'expired'
    | 'invalid'
    | 'not_found' = 'idle';

  constructor(private patientApi: PatientApiService) {}

  ngOnInit() {
    this.fetchPatients();
  }

  // --- Data Fetching ---
  fetchPatients() {
    this.loading = true;
    this.error = null;
    this.patientApi.getPatients().subscribe({
      next: (patients) => {
        this.allPatients = patients;
        this.filteredPatients = [...this.allPatients];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load patients', err);
        this.error =
          'Failed to load patients. Make sure the backend is running.';
        this.loading = false;
      },
    });
  }

  // --- Search & Filter Logic ---
  onSearch() {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.applyFilter();
      return;
    }
    // Match names that contain the query
    this.filteredPatients = this.allPatients.filter((p) =>
      p.name.toLowerCase().includes(q),
    );
  }

  toggleFilter() {
    this.filterOpen = !this.filterOpen;
  }

  applyFilter() {
    let list = [...this.allPatients];

    // Apply search string
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Apply age bounds (fallback to 0 if age is undefined)
    list = list.filter((p) => {
      const age = p.age || 0;
      return age >= this.ageMin && age <= this.ageMax;
    });

    // Apply sorting
    if (this.sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'age') {
      list.sort((a, b) => (a.age || 0) - (b.age || 0));
    } else if (this.sortBy === 'id') {
      list.sort((a, b) => Number(a.id) - Number(b.id));
    } else if (this.sortBy === 'lastUpdated') {
      list.sort((a, b) => {
        const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return timeB - timeA;
      });
    }

    this.filteredPatients = list;
    this.filterOpen = false;
  }

  resetFilter() {
    this.sortBy = 'name';
    this.ageMin = 0;
    this.ageMax = 120;
    this.applyFilter();
  }

  // --- Modal & OTP Logic ---
  openAddModal() {
    this.modalOpen = true;
    this.otpValue = '';
    this.otpState = 'idle';
  }

  closeModal() {
    this.modalOpen = false;
  }

  onOtpChange(otp: string) {
    this.otpValue = otp;
    this.otpState = 'idle';
  }

  submitOtp() {
    if (!this.otpComplete) return;
    this.otpState = 'loading';

    // Placeholder timeout logic for UI simulation.
    // Replace this block with your actual OTP verification API call later.
    setTimeout(() => {
      const code = this.otpValue;
      if (code === '000000') this.otpState = 'expired';
      else if (code === '222222') this.otpState = 'not_found';
      else if (code === '333333') this.otpState = 'forwarded';
      else this.otpState = 'success';
    }, 1200);
  }

  get otpComplete(): boolean {
    return this.otpValue.length === 6;
  }
}
