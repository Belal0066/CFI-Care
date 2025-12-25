import { TestBed } from '@angular/core/testing';

import { SelectedPatient } from './selected-patient';

describe('SelectedPatient', () => {
  let service: SelectedPatient;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectedPatient);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
