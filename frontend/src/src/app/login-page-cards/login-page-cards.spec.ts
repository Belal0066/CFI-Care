import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPageCards } from './login-page-cards';

describe('LoginPageCards', () => {
  let component: LoginPageCards;
  let fixture: ComponentFixture<LoginPageCards>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPageCards]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginPageCards);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
