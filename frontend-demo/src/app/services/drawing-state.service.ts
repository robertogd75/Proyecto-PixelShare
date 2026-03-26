import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DrawingStateService {
  private isDirtySubject = new BehaviorSubject<boolean>(false);
  
  /** Observable of the dirty state */
  isDirty$ = this.isDirtySubject.asObservable();

  /** Current value of the dirty state */
  get isDirty(): boolean {
    return this.isDirtySubject.value;
  }

  /** Update the dirty state */
  setDirty(value: boolean): void {
    this.isDirtySubject.next(value);
  }

  /** Clear the dirty state */
  reset(): void {
    this.isDirtySubject.next(false);
  }
}
