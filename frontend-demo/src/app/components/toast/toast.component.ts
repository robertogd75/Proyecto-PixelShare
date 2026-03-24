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
      right: 20px;
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
      background: color-mix(in srgb, var(--panel-solid) 88%, transparent);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      border: 1px solid var(--border-soft);
      display: flex;
      align-items: center;
      gap: 15px;
      animation: toastSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }

    @keyframes toastSlide {
      from { transform: translateX(50px); opacity: 0; }
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

    .success .toast-icon { background: #e6fffa; color: #38b2ac; }
    .error .toast-icon { background: #fff5f5; color: #f56565; }
    .info .toast-icon { background: #ebf8ff; color: #4299e1; }

    .toast-message {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-main);
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
