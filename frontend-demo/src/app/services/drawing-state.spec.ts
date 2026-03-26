import { TestBed } from '@angular/core/testing';

import { DrawingState } from './drawing-state';

describe('DrawingState', () => {
  let service: DrawingState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DrawingState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
