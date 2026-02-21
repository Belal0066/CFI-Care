import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppointmentTestComponent } from './appointment-test.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('AppointmentTestComponent', () => {
  let component: AppointmentTestComponent;
  let fixture: ComponentFixture<AppointmentTestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentTestComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
