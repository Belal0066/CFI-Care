import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelectedPatientService } from '../services/selected-patient';

@Component({
  selector: 'app-users',
  imports: [CommonModule],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users {

  patients = [
    { id: 1, name: 'Name1', updated: '1 week ago', age: '24y' },
    { id: 2, name: 'Name2', updated: 'today', age: '36y' },
    { id: 3, name: 'Name3', updated: 'yesterday', age: '77y' },
    { id: 4, name: 'Name3', updated: 'yesterday', age: '47y' },
    { id: 5, name: 'Name3', updated: 'yesterday', age: '57y' },
    //add more patients data
  ];

  constructor(private selectedPatientService: SelectedPatientService) {}

  onPatientClick(patient: any) {
    this.selectedPatientService.selectPatient(patient);
  }

}
