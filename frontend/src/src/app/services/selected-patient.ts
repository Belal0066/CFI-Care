import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SelectedPatientService {

  private selectedPatientSubject =
    new BehaviorSubject<any | null>(null);

  selectedPatient$ =
    this.selectedPatientSubject.asObservable();

  selectPatient(patient: any) {
    this.selectedPatientSubject.next(patient);
  }
}
