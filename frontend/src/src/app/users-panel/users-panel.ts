import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Users } from '../users/users';
import { PatientSummaryDTO } from '../users/users';
import { NgOtpInputModule } from 'ng-otp-input';

@Component({
  selector: 'app-users-panel',
  imports: [Users, CommonModule, FormsModule, NgOtpInputModule],
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.css'
})
export class UsersPanel implements OnInit {

  // All patients (would come from service in real app)
  allPatients: PatientSummaryDTO[] = [
    { id: 1, name: 'Mahmoud Karim',    age: 23, lastUpdated: '2026-02-18T10:00:00Z', primaryDiagnosis: 'Type 2 Diabetes' },
    { id: 2, name: 'Fatema Ahmed', age: 36, lastUpdated: '2025-10-01T08:00:00Z', primaryDiagnosis: 'Hypertension' },
    { id: 3, name: 'Amir Shaker',   age: 77, lastUpdated: '2025-12-25T14:30:00Z', primaryDiagnosis: 'Cardiac Arrhythmia' },
    { id: 4, name: 'Mamdouh Fatah',    age: 24, lastUpdated: '2024-06-15T09:00:00Z', primaryDiagnosis: 'Asthma' },
    { id: 5, name: 'Shaaban Karim',    age: 55, lastUpdated: '2025-11-20T11:00:00Z', primaryDiagnosis: 'Hyperlipidemia' },
  ];

  filteredPatients: PatientSummaryDTO[] = [];

  // Search
  searchQuery: string = '';

  // Filter
  filterOpen: boolean = false;
  sortBy: string = 'name';
  ageMin: number = 0;
  ageMax: number = 120;

  // Modal
  modalOpen: boolean = false;
  patientIdInput: string = '';
  idFormatError: string = '';
  modalSearched: boolean = false;
  modalPatientFound: boolean = false;
  accessRequested: boolean = false;

  // ID format: 2 uppercase letters + 4 digits
  private idPattern = /^[A-Za-z]{2}\d{4}$/;

  // Simulated known IDs (replace with real API call)
  private knownPatientIds: string[] = ['AB1234', 'CD5678', 'EF9012'];

  ngOnInit() {
    this.filteredPatients = [...this.allPatients];
  }

  onSearch() {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.applyFilter();
      return;
    }
    // Only match names that START with the query
    this.filteredPatients = this.allPatients.filter(p =>
      p.name.toLowerCase().startsWith(q)
    );
  }

  toggleFilter() {
    this.filterOpen = !this.filterOpen;
  }

  applyFilter() {
    let list = [...this.allPatients];

    // Apply search on top
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p => p.name.toLowerCase().startsWith(q));
    }

    // Age filter
    list = list.filter(p => p.age >= this.ageMin && p.age <= this.ageMax);

    // Sort
    if (this.sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'age') {
      list.sort((a, b) => a.age - b.age);
    } else if (this.sortBy === 'id') {
      list.sort((a, b) => a.id - b.id);
    } else if (this.sortBy === 'lastUpdated') {
      list.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
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

  openAddModal() {
    this.modalOpen = true;
    this.patientIdInput = '';
    this.idFormatError = '';
    this.modalSearched = false;
    this.modalPatientFound = false;
    this.accessRequested = false;
    this.otpValue = '';
    this.otpState = 'idle';
  }

  closeModal() {
    this.modalOpen = false;
  }

  otpValue: string = '';
  otpState: 'idle' | 'loading' | 'success' | 'forwarded' | 'expired' | 'invalid' | 'not_found' = 'idle';

  onOtpChange(otp: string) {
    this.otpValue = otp;
    this.otpState = 'idle';
  }
  submitOtp() {
    if (!this.otpComplete) return;
    this.otpState = 'loading';

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

  requestAccess() {
    this.accessRequested = true;
  }
}