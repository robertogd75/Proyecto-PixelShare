import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';


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

  /** Subject to request a leave confirmation modal from another component (like Navbar) */
  private requestConfirmSource = new Subject<void>();
  requestConfirm$ = this.requestConfirmSource.asObservable();

  /** Subject to report the user's decision back to the requester */
  private confirmResponseSource = new Subject<boolean>();
  confirmResponse$ = this.confirmResponseSource.asObservable();

  /** Boolean to temporarily disable the browser's native beforeunload dialog */
  public bypassBeforeUnload = false;

  /** Update the dirty state */

  setDirty(value: boolean): void {
    this.isDirtySubject.next(value);
  }

  /** Trigger the confirmation modal in whatever component is listening (usually Canvas) */
  requestLeaveConfirmation(): void {
    this.requestConfirmSource.next();
  }

  /** Send the user's decision back to the requester */
  sendResponse(proceed: boolean): void {
    this.confirmResponseSource.next(proceed);
  }

  /** Clear the dirty state */
  reset(): void {
    this.isDirtySubject.next(false);
  }
}

