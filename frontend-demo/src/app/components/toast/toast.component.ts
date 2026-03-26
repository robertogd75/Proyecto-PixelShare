import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Toast, ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of activeToasts" 
           class="toast-item" 
           [class.success]="toast.type === 'success'"
           [class.error]="toast.type === 'error'"
           [class.info]="toast.type === 'info'">
        <div class="toast-icon">
          <span *ngIf="toast.type === 'success'">✓</span>
          <span *ngIf="toast.type === 'error'">!</span>
          <span *ngIf="toast.type === 'info'">ℹ</span>
        </div>
        <div class="toast-message">{{ toast.message }}</div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 9999;

      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast-item {
      min-width: 300px;
      padding: 16px 20px;
      border-radius: 16px;
      background: var(--bg-card);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      box-shadow: 0 10px 30px var(--shadow-color);
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 15px;
      animation: toastSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }


    @keyframes toastSlide {
      from { transform: translateX(-50px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }


    .toast-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
    }

    .success .toast-icon { background: #e6fffa; color: #1a7f71; }
    .error .toast-icon { background: #fff5f5; color: #c53030; }
    .info .toast-icon { background: #ebf8ff; color: #2b6cb0; }

    :host-context(body.theme-dark) .success .toast-icon { background: #1a3a3a; color: #4fd1c5; }
    :host-context(body.theme-dark) .error .toast-icon { background: #3a1a1a; color: #fc8181; }
    :host-context(body.theme-dark) .info .toast-icon { background: #1a2a3a; color: #63b3ed; }

    .toast-message {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

  `]
})
export class ToastComponent implements OnInit, OnDestroy {
  activeToasts: Toast[] = [];
  private subscription!: Subscription;

  constructor(private toastService: ToastService) {}

  ngOnInit() {
    this.subscription = this.toastService.toasts$.subscribe(toast => {
      this.activeToasts.push(toast);
      setTimeout(() => {
        this.activeToasts = this.activeToasts.filter(t => t !== toast);
      }, toast.duration || 3000);
    });
  }

  ngOnDestroy() {
    if (this.subscription) this.subscription.unsubscribe();
  }
}
