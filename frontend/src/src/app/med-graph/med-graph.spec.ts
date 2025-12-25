import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MedGraph } from './med-graph';

describe('MedGraph', () => {
  let component: MedGraph;
  let fixture: ComponentFixture<MedGraph>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MedGraph]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MedGraph);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
