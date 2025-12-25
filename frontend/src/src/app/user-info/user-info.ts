import { Component } from '@angular/core';
import { SelectedPatientService } from '../services/selected-patient';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-info',
  imports: [CommonModule],
  templateUrl: './user-info.html',
  styleUrl: './user-info.css'
})
export class UserInfo {

  selectedPatient: any | null = null;

  constructor(private selectedPatientService: SelectedPatientService) {}

  ngOnInit() {
    this.selectedPatientService.selectedPatient$
      .subscribe(patient => {
        this.selectedPatient = patient;
      });
  }


}
