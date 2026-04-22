import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatSection } from './chat-section';

describe('ChatSection', () => {
  let component: ChatSection;
  let fixture: ComponentFixture<ChatSection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatSection]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatSection);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
