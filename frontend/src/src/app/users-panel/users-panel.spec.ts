import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsersPanel } from './users-panel';

describe('UsersPanel', () => {
  let component: UsersPanel;
  let fixture: ComponentFixture<UsersPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersPanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UsersPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
