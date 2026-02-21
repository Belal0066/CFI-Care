import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AppointmentService,
  Practitioner,
  Schedule,
  Slot,
  Appointment,
} from '../services/appointment/appointment.service';

@Component({
  selector: 'app-appointment-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointment-test.component.html',
  styleUrls: ['./appointment-test.component.css'],
})
export class AppointmentTestComponent implements OnInit {
  // Data
  practitioners: Practitioner[] = [];
  schedules: Schedule[] = [];
  slots: Slot[] = [];
  appointments: any = null;

  // Selected IDs
  selectedPractitionerId: string = '';
  selectedScheduleId: string = '';
  selectedSlotId: string = '';

  // New Schedule Form
  newSchedule = {
    practitionerId: '',
    startDate: '',
    endDate: '',
    active: true,
  };

  // New Slot Form
  newSlot = {
    scheduleId: '',
    startDateTime: '',
    endDateTime: '',
    status: 'free',
  };

  // Show forms
  showScheduleForm: boolean = false;
  showSlotForm: boolean = false;

  // Loading states
  loadingPractitioners: boolean = false;
  loadingSchedules: boolean = false;
  loadingSlots: boolean = false;
  loadingAppointments: boolean = false;

  // Response messages
  message: string = '';
  errorMessage: string = '';

  // Active tab
  activeTab: 'practitioners' | 'schedules' | 'slots' | 'appointments' =
    'practitioners';

  constructor(private appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.loadPractitioners();
  }

  // Load practitioners
  loadPractitioners(): void {
    this.loadingPractitioners = true;
    this.errorMessage = '';
    this.appointmentService.getPractitioners().subscribe({
      next: (data) => {
        this.practitioners = data;
        this.loadingPractitioners = false;
        this.message = `Loaded ${data.length} practitioners`;
      },
      error: (error) => {
        this.loadingPractitioners = false;
        this.errorMessage = `Error loading practitioners: ${error.message}`;
      },
    });
  }

  // Load schedules for selected practitioner
  loadSchedules(): void {
    if (!this.selectedPractitionerId) {
      this.errorMessage = 'Please select a practitioner first';
      return;
    }

    this.loadingSchedules = true;
    this.errorMessage = '';
    this.appointmentService
      .getSchedulesByPractitioner(this.selectedPractitionerId)
      .subscribe({
        next: (data) => {
          this.schedules = data;
          this.loadingSchedules = false;
          this.message = `Loaded ${data.length} schedules for practitioner`;
        },
        error: (error) => {
          this.loadingSchedules = false;
          this.errorMessage = `Error loading schedules: ${error.message}`;
        },
      });
  }

  // Load slots for selected practitioner
  loadSlots(): void {
    if (!this.selectedPractitionerId) {
      this.errorMessage = 'Please select a practitioner first';
      return;
    }

    this.loadingSlots = true;
    this.errorMessage = '';
    this.appointmentService
      .getSlotsByPractitioner(this.selectedPractitionerId)
      .subscribe({
        next: (data) => {
          this.slots = data;
          this.loadingSlots = false;
          this.message = `Loaded ${data.length} slots for practitioner`;
        },
        error: (error) => {
          this.loadingSlots = false;
          this.errorMessage = `Error loading slots: ${error.message}`;
        },
      });
  }

  // Load appointments for selected practitioner
  loadAppointments(): void {
    if (!this.selectedPractitionerId) {
      this.errorMessage = 'Please select a practitioner first';
      return;
    }

    this.loadingAppointments = true;
    this.errorMessage = '';
    this.appointmentService
      .getAppointmentsByPractitioner(this.selectedPractitionerId)
      .subscribe({
        next: (data) => {
          this.appointments = data;
          this.loadingAppointments = false;
          this.message = `Loaded appointments for practitioner`;
        },
        error: (error) => {
          this.loadingAppointments = false;
          this.errorMessage = `Error loading appointments: ${error.message}`;
        },
      });
  }

  // Create Schedule
  createSchedule(): void {
    if (!this.selectedPractitionerId) {
      this.errorMessage = 'Please select a practitioner first';
      return;
    }

    if (!this.newSchedule.startDate || !this.newSchedule.endDate) {
      this.errorMessage = 'Please fill in both start and end dates';
      return;
    }

    const scheduleData = {
      resourceType: 'Schedule',
      active: this.newSchedule.active,
      actor: [
        {
          reference: `Practitioner/${this.selectedPractitionerId}`,
        },
      ],
      planningHorizon: {
        start: new Date(this.newSchedule.startDate).toISOString(),
        end: new Date(this.newSchedule.endDate).toISOString(),
      },
    };

    this.appointmentService.createSchedule(scheduleData).subscribe({
      next: (schedule) => {
        this.message = `Schedule created successfully! ID: ${schedule.id}`;
        this.errorMessage = '';
        this.showScheduleForm = false;
        this.resetScheduleForm();
        this.loadSchedules();
      },
      error: (error) => {
        this.errorMessage = `Error creating schedule: ${error.error?.error || error.message}`;
      },
    });
  }

  // Create Slot
  createSlot(): void {
    if (!this.newSlot.scheduleId) {
      this.errorMessage = 'Please select a schedule';
      return;
    }

    if (!this.newSlot.startDateTime || !this.newSlot.endDateTime) {
      this.errorMessage = 'Please fill in both start and end times';
      return;
    }

    const slotData = {
      resourceType: 'Slot',
      schedule: {
        reference: `Schedule/${this.newSlot.scheduleId}`,
      },
      status: this.newSlot.status,
      start: new Date(this.newSlot.startDateTime).toISOString(),
      end: new Date(this.newSlot.endDateTime).toISOString(),
    };

    this.appointmentService.createSlot(slotData).subscribe({
      next: (slot) => {
        this.message = `Slot created successfully! ID: ${slot.id}`;
        this.errorMessage = '';
        this.showSlotForm = false;
        this.resetSlotForm();
        this.loadSlots();
      },
      error: (error) => {
        this.errorMessage = `Error creating slot: ${error.error?.error || error.message}`;
      },
    });
  }

  // Reset forms
  resetScheduleForm(): void {
    this.newSchedule = {
      practitionerId: '',
      startDate: '',
      endDate: '',
      active: true,
    };
  }

  resetSlotForm(): void {
    this.newSlot = {
      scheduleId: '',
      startDateTime: '',
      endDateTime: '',
      status: 'free',
    };
  }

  // Toggle forms
  toggleScheduleForm(): void {
    this.showScheduleForm = !this.showScheduleForm;
    if (this.showScheduleForm) {
      this.newSchedule.practitionerId = this.selectedPractitionerId;
    }
  }

  toggleSlotForm(): void {
    this.showSlotForm = !this.showSlotForm;
    if (this.showSlotForm && this.schedules.length > 0) {
      this.newSlot.scheduleId = this.schedules[0].id;
    }
  }

  // Select practitioner
  selectPractitioner(id: string): void {
    this.selectedPractitionerId = id;
    this.selectedScheduleId = '';
    this.selectedSlotId = '';
    this.schedules = [];
    this.slots = [];
    this.appointments = null;
    this.message = `Selected practitioner: ${id}`;
    this.errorMessage = '';
  }

  // Format date
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  // Get slot status badge class
  getSlotStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'free':
        return 'badge-success';
      case 'busy':
        return 'badge-danger';
      case 'busy-unavailable':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  // Get appointment status badge class
  getAppointmentStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'booked':
        return 'badge-success';
      case 'cancelled':
        return 'badge-danger';
      case 'pending':
        return 'badge-warning';
      default:
        return 'badge-secondary';
    }
  }

  // Clear messages
  clearMessages(): void {
    this.message = '';
    this.errorMessage = '';
  }
}
