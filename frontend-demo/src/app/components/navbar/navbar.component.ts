import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { ToastService } from '../../services/toast.service';
import { ThemeService } from '../../services/theme.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <nav class="glass-navbar">
      <div class="logo-container" routerLink="/">
        <div class="logo-pixel"></div>
        <span class="logo-text">PixelShare</span>
      </div>

      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-link">Pizarra Privada</a>
        <button (click)="toggleTheme()" class="nav-btn theme-toggle" [attr.aria-label]="isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'">
          <svg *ngIf="!isDarkMode" class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3a1 1 0 0 1 1.05 1.34A7 7 0 0 0 19.66 11.74 1 1 0 0 1 21 12.79Z"/>
          </svg>
          <svg *ngIf="isDarkMode" class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 18a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Zm0-16a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm9 9a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2ZM5 11a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h2Zm12.66 6.24 1.41 1.41a1 1 0 0 1-1.41 1.41l-1.41-1.41a1 1 0 1 1 1.41-1.41ZM7.34 6.93a1 1 0 0 1 0 1.41L5.93 9.75a1 1 0 1 1-1.41-1.41l1.41-1.41a1 1 0 0 1 1.41 0Zm12.13 0a1 1 0 0 1 0 1.41l-1.41 1.41a1 1 0 1 1-1.41-1.41l1.41-1.41a1 1 0 0 1 1.41 0ZM7.76 17.66a1 1 0 0 1-1.41 1.41l-1.41-1.41a1 1 0 0 1 1.41-1.41l1.41 1.41ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>
          </svg>
        </button>
        <button (click)="openJoinModal()" class="nav-btn secondary">Unirse a Sala</button>
        <button (click)="openCreateModal()" class="nav-btn primary">Crear Sala</button>
      </div>
    </nav>

    <!-- Modal System -->
    <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ modalTitle }}</h2>
          <button class="btn-close" (click)="closeModal()">&times;</button>
        </div>

        <div class="modal-body">
          <p class="description">{{ modalDescription }}</p>

          <!-- Create Mode -->
          <div class="form-group" *ngIf="modalMode === 'create'">
            <label>Nombre de la Pizarra</label>
            <input type="text" [(ngModel)]="roomName" placeholder="Ej: Proyecto Arte Final" (keyup.enter)="submitModal()" [disabled]="isCreating">
          </div>

          <!-- Join Mode -->
          <div class="form-group" *ngIf="modalMode === 'join'">
            <label>Código de la Sala</label>
            <input type="text" [(ngModel)]="roomCode" placeholder="AAAA-BBBB-CCCC" (keyup.enter)="submitModal()">
          </div>

          <!-- Success State -->
          <div class="success-content" *ngIf="modalMode === 'success'">
            <div class="code-display">
              <label>Código de Acceso</label>
              <div class="code-value">{{ inviteCode }}</div>
            </div>
            <div class="success-actions">
              <button class="btn-copy-code" (click)="copyInvitationCode()">
                <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M8 2h8a2 2 0 0 1 2 2v2h-2V4H8v12h2v2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 6h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm0 2v10h8V10h-8Z"/>
                </svg>
                <span>Copiar Código</span>
              </button>
              <button class="btn-copy-link" (click)="copyInvitation()">
                <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M10.59 13.41a1 1 0 0 1 0-1.41l3-3a3 3 0 0 1 4.24 4.24l-2.12 2.12a3 3 0 0 1-4.24 0 1 1 0 1 1 1.41-1.41 1 1 0 0 0 1.41 0l2.12-2.12a1 1 0 0 0-1.41-1.41l-3 3a1 1 0 0 1-1.41 0Zm2.82-2.82a1 1 0 0 1 0 1.41l-3 3a3 3 0 1 1-4.24-4.24l2.12-2.12a3 3 0 0 1 4.24 0 1 1 0 1 1-1.41 1.41 1 1 0 0 0-1.41 0L7.59 12.17a1 1 0 0 0 1.41 1.41l3-3a1 1 0 0 1 1.41 0Z"/>
                </svg>
                <span>Copiar Enlace</span>
              </button>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" (click)="closeModal()">{{ modalMode === 'success' ? 'Cerrar' : 'Cancelar' }}</button>
            <button class="btn-submit" (click)="submitModal()" [disabled]="(modalMode === 'create' && (!roomName || isCreating)) || (modalMode === 'join' && !roomCode)">
              <span *ngIf="!isCreating">{{ modalActionText }}</span>
              <span *ngIf="isCreating">Creando...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .glass-navbar {
      height: 70px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 40px;
      background: var(--navbar-bg);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-bottom: 1px solid var(--border-soft);
      position: sticky;
      top: 0;
      z-index: 1000;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .logo-pixel {
      width: 24px;
      height: 24px;
      background: var(--text-main);
      border-radius: 6px;
      box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
    }

    :host-context(.theme-dark) .logo-pixel {
      background: #f5f7fa;
      border: 1px solid rgba(255,255,255,0.2);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 8px 18px rgba(0,0,0,0.45);
    }

    .logo-text {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -1px;
      color: var(--text-main);
    }

    :host-context(.theme-dark) .logo-text {
      text-shadow: 0 0 10px rgba(255,255,255,0.18);
    }

    .nav-links {
      display: flex;
      gap: 15px;
      align-items: center;
    }

    .nav-link {
      text-decoration: none;
      color: var(--text-soft);
      font-weight: 600;
      font-size: 0.95rem;
      padding: 8px 15px;
      border-radius: 10px;
      transition: all 0.2s;
    }

    .nav-link:hover, .nav-link.active {
      color: var(--text-main);
      background: var(--panel-muted);
    }

    .nav-btn {
      padding: 10px 20px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.9rem;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .nav-btn.primary { background: var(--btn-primary-bg); color: var(--btn-primary-text); }
    .nav-btn.secondary { background: var(--btn-secondary-bg); color: var(--btn-secondary-text); }
    .nav-btn.theme-toggle {
      width: 42px;
      height: 42px;
      padding: 0;
      border-radius: 50%;
      background: var(--panel-muted);
      color: var(--text-main);
    }
    .theme-icon {
      width: 20px;
      height: 20px;
      display: block;
    }
    .nav-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--overlay-bg);
      backdrop-filter: blur(8px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      padding: 20px;
    }

    .modal-content {
      background: var(--panel-solid);
      width: 100%;
      max-width: 450px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      animation: modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes modalPop {
      from { transform: scale(0.95) translateY(10px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }

    .modal-header {
      padding: 25px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-soft);
    }

    .modal-header h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
    .btn-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-soft); }

    .modal-body { padding: 30px; }
    .description { color: var(--text-soft); margin-bottom: 25px; line-height: 1.5; }

    .form-group { margin-bottom: 25px; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .form-group input { width: 100%; padding: 15px; border-radius: 12px; border: 2px solid var(--border-soft); font-size: 1rem; font-weight: 600; transition: all 0.2s; background: var(--input-bg); color: var(--text-main); }
    .form-group input:focus { outline: none; border-color: var(--text-main); }

    .modal-footer { display: flex; gap: 15px; margin-top: 10px; }
    .btn-cancel, .btn-submit { flex: 1; padding: 14px; border-radius: 14px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; }
    .btn-cancel { background: var(--panel-muted); color: var(--text-soft); }
    .btn-submit { background: var(--btn-primary-bg); color: var(--btn-primary-text); }
    .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Success State Styles */
    .success-content {
      background: var(--panel-muted);
      border: 1px solid var(--border-soft);
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 25px;
      text-align: center;
    }
    .code-display { margin-bottom: 20px; }
    .code-display label { font-size: 0.75rem; font-weight: 800; color: var(--text-soft); text-transform: uppercase; }
    .code-value {
      font-size: 2rem;
      font-weight: 900;
      color: var(--text-main);
      letter-spacing: 2px;
      margin-top: 5px;
    }
    .success-actions { display: flex; gap: 12px; }
    .btn-copy-code, .btn-copy-link {
      flex: 1;
      padding: 12px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.85rem;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .action-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .btn-copy-code { background: var(--panel-solid); border: 1px solid var(--border-soft); color: var(--text-main); }
    .btn-copy-link { background: var(--btn-primary-bg); color: var(--btn-primary-text); }
    .btn-copy-code:hover, .btn-copy-link:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

    /* ================================================
       RESPONSIVE — TABLET (769px – 1024px)
       ================================================ */
    @media (max-width: 1024px) {
      .glass-navbar { padding: 0 20px; }
      .logo-text { font-size: 1.2rem; }
      .nav-link { font-size: 0.88rem; padding: 7px 10px; }
      .nav-btn { padding: 9px 14px; font-size: 0.85rem; }
    }

    /* ================================================
       RESPONSIVE — MOBILE (≤ 768px)
       ================================================ */
    @media (max-width: 768px) {
      .glass-navbar {
        height: 58px;
        padding: 0 14px;
      }

      .logo-text { font-size: 1.1rem; }
      .logo-pixel { width: 20px; height: 20px; }

      /* Hide text nav link on mobile to save space */
      .nav-link { display: none; }

      .nav-links { gap: 8px; }

      .nav-btn {
        padding: 8px 12px;
        font-size: 0.8rem;
        border-radius: 10px;
      }

      /* Modal full-width on mobile */
      .modal-overlay { padding: 12px; align-items: flex-end; }

      .modal-content {
        border-radius: 20px 20px 16px 16px;
        max-width: 100%;
      }

      .modal-header { padding: 18px 20px; }
      .modal-header h2 { font-size: 1.1rem; }

      .modal-body { padding: 20px; }

      .code-value { font-size: 1.5rem; letter-spacing: 1px; }

      .success-actions { flex-direction: column; }
      .btn-copy-code, .btn-copy-link { padding: 13px; }

      .modal-footer { flex-direction: column; gap: 10px; }
      .btn-cancel, .btn-submit { padding: 13px; font-size: 0.95rem; }
    }

    @media (max-width: 400px) {
      .nav-btn.secondary { display: none; }
    }
  `]
})
export class NavbarComponent {
  showModal = false;
  modalMode: 'join' | 'create' | 'success' = 'create';
  roomName = '';
  roomCode = '';
  inviteCode = '';
  isCreating = false;

  constructor(
    private router: Router,
    private pixelService: PixelService,
    private toastService: ToastService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  get isDarkMode(): boolean {
    return this.themeService.currentTheme === 'dark';
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  get modalTitle(): string {
    if (this.modalMode === 'success') return '¡Sala Creada!';
    return this.modalMode === 'create' ? 'Nueva Pizarra' : 'Entrar a Sala';
  }

  get modalDescription(): string {
    if (this.modalMode === 'success') return 'Tu sala está lista. Comparte el acceso con tus amigos.';
    return this.modalMode === 'create'
      ? 'Define un nombre para tu espacio de dibujo colaborativo.'
      : 'Escribe el código de invitación para unirte.';
  }

  get modalActionText(): string {
    if (this.modalMode === 'success') return 'Entrar a la Sala';
    return this.modalMode === 'create' ? 'Crear Ahora' : 'Unirse';
  }

  openJoinModal() {
    this.modalMode = 'join';
    this.roomCode = '';
    this.showModal = true;
  }

  openCreateModal() {
    this.modalMode = 'create';
    this.roomName = '';
    this.showModal = true;
    this.isCreating = false;
  }

  closeModal() {
    this.showModal = false;
  }

  submitModal() {
    if (this.modalMode === 'join') {
      if (this.roomCode) {
        this.router.navigateByUrl(`/room/${this.roomCode.toUpperCase().trim()}`);
        this.closeModal();
      }
    } else if (this.modalMode === 'create') {
      if (this.roomName && !this.isCreating) {
        this.isCreating = true;
        const code = this.generateSecureCode();
        this.pixelService.createRoom({ code, name: this.roomName })
          .pipe(
            finalize(() => {
              this.isCreating = false;
              this.cdr.detectChanges();
            })
          )
          .subscribe({
            next: room => {
              if (room && room.code) {
                this.inviteCode = room.code;
                this.modalMode = 'success';
                this.toastService.success('¡Sala creada correctamente!');
              } else {
                this.toastService.error('Error: Respuesta del servidor inválida.');
              }
              this.cdr.detectChanges();
            },
            error: (err) => {
              console.error('Room creation error:', err);
              let errMsg = 'Hubo un error al crear la sala.';
              if (err.name === 'TimeoutError') {
                errMsg = 'El servidor tardó demasiado en responder.';
              } else if (err.status === 502 || err.status === 503 || err.status === 504 || err.status === 0) {
                errMsg = 'No se puede conectar con el servidor en este momento.';
              } else if (err.status) {
                errMsg += ` (Error ${err.status})`;
              }
              this.toastService.error(errMsg, 5000);
              this.cdr.detectChanges();
            }
          });
      }
    } else if (this.modalMode === 'success') {
      sessionStorage.setItem('pixelshare_host_room', this.inviteCode);
      this.router.navigateByUrl(`/room/${this.inviteCode}`);
      this.closeModal();
    }
  }

  copyInvitation() {
    const url = window.location.origin + '/room/' + this.inviteCode;
    this.copyToClipboard(url, '¡Enlace de invitación copiado!');
  }

  copyInvitationCode() {
    this.copyToClipboard(this.inviteCode, '¡Código de sala copiado!');
  }

  private copyToClipboard(text: string, message: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.toastService.success(message);
      }).catch(err => {
        this.fallbackCopyTextToClipboard(text, message);
      });
    } else {
      this.fallbackCopyTextToClipboard(text, message);
    }
  }

  private fallbackCopyTextToClipboard(text: string, message: string) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      this.toastService.success(message);
    } catch (err) {
      this.toastService.error('Error: Por favor, copia el texto manualmente.');
    }
    document.body.removeChild(textArea);
  }

  private generateSecureCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) result += '-';
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
