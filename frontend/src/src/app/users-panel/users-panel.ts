import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Users } from '../users/users';
import { NgOtpInputModule } from 'ng-otp-input';
import { PatientSummaryDTO } from '../models/patient.model';
import { HandshakeService } from '../services/handshake/handshake.service';
import { Subscription, interval } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { VerifyOtpResponse, HandshakeStatus } from '../models/grant.model';

//mock
  // import { MOCK_PATIENTS } from '../mocks/patient.mocks';


@Component({
  selector: 'app-users-panel',
  standalone: true,
  imports: [Users, CommonModule, FormsModule, NgOtpInputModule],
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.css',
})
export class UsersPanel implements OnInit, OnDestroy {
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

  private pollSub: Subscription | null = null;

  constructor(private handshake: HandshakeService) {}

  ngOnInit() {
    this.fetchPatients();
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  // --- Data Fetching ---
  fetchPatients() {
    this.loading = true;
    this.error = null;
    this.handshake.getGrantedPatients().subscribe({
      next: (res: { patients: PatientSummaryDTO[] }) => {
        this.allPatients = res.patients;
        this.filteredPatients = [...this.allPatients];
        this.loading = false;
      },
      error: (err: unknown) => {
        console.error('Failed to load patients', err);
        this.error =
          'Failed to load patients. Make sure the backend is running.';
        this.loading = false;
      },
    });
  }

// mock
// fetchPatients() {
//   this.loading = true;

//   setTimeout(() => {
//     this.allPatients = MOCK_PATIENTS;
//     this.filteredPatients = [...this.allPatients];
//     this.loading = false;
//   }, 300);
// }
//mock

  // --- Search & Filter Logic ---
  onSearch() {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.applyFilter();
      return;
    }
    this.filteredPatients = this.allPatients.filter((p) =>
      p.name.toLowerCase().includes(q),
    );
  }

  toggleFilter() {
    this.filterOpen = !this.filterOpen;
  }

  applyFilter() {
    let list = [...this.allPatients];

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    list = list.filter((p) => {
      const age = p.age || 0;
      return age >= this.ageMin && age <= this.ageMax;
    });

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
    this.pollSub?.unsubscribe();
  }

  closeModal() {
    this.modalOpen = false;
    this.pollSub?.unsubscribe();
  }

  onOtpChange(otp: string) {
    this.otpValue = otp;
    this.otpState = 'idle';
  }

  submitOtp() {
    if (!this.otpComplete) return;
    this.otpState = 'loading';

    this.handshake.verifyOtp(this.otpValue).subscribe({
      next: (res: VerifyOtpResponse) => {
        this.otpState = 'forwarded';
        this.startPolling(res.handshakeId, res.targetpatientId);
      },
      error: (err: { status: number }) => {
        if (err.status === 401) this.otpState = 'invalid';
        else if (err.status === 404) this.otpState = 'not_found';
        else this.otpState = 'expired';
      },
    });
  }

  private startPolling(handshakeId: string, patientId: string) {
    this.pollSub?.unsubscribe();

    this.pollSub = interval(3000)
      .pipe(
        switchMap(() => this.handshake.pollStatus(handshakeId, patientId)),
        takeWhile((s: HandshakeStatus) => s.status === 'pending', true)
      )
      .subscribe({
        next: (s: HandshakeStatus) => {
          if (s.status === 'approved') {
            this.otpState = 'success';
            this.fetchPatients();
          } else if (s.status === 'expired') {
            this.otpState = 'expired';
          }
        },
        error: () => {
          this.otpState = 'expired';
        },
      });
  }

  get otpComplete(): boolean {
    return this.otpValue.length === 6;
  }
}
