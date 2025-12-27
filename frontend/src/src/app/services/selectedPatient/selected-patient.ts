//frontend

// import { Injectable } from '@angular/core';
// import { BehaviorSubject } from 'rxjs';

// @Injectable({
//   providedIn: 'root'
// })
// export class SelectedPatientService {

//   private selectedPatientSubject =
//     new BehaviorSubject<any | null>(null);

//   selectedPatient$ =
//     this.selectedPatientSubject.asObservable();

//   selectPatient(patient: any) {
//     this.selectedPatientSubject.next(patient);
//   }

// }



//backend 
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SelectedPatientService {

  private selectedPatientIdSubject =
    new BehaviorSubject<number | null>(null);

  selectedPatientId$ =
    this.selectedPatientIdSubject.asObservable();

  selectPatient(id: number) {
    this.selectedPatientIdSubject.next(id);
  }

  clearSelection() {
    this.selectedPatientIdSubject.next(null);
  }
}
