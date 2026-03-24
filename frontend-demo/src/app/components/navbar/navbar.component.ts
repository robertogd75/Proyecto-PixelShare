import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { ToastService } from '../../services/toast.service';
import { finalize, timeout } from 'rxjs';

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
                <span>📄 Copiar Código</span>
              </button>
              <button class="btn-copy-link" (click)="copyInvitation()">
                <span>🔗 Copiar Enlace</span>
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
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
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
      background: #000;
      border-radius: 6px;
      box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
    }

    .logo-text {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -1px;
      color: #000;
    }

    .nav-links {
      display: flex;
      gap: 15px;
      align-items: center;
    }

    .nav-link {
      text-decoration: none;
      color: #666;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 8px 15px;
      border-radius: 10px;
      transition: all 0.2s;
    }

    .nav-link:hover, .nav-link.active {
      color: #000;
      background: rgba(0, 0, 0, 0.03);
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

    .nav-btn.primary { background: #000; color: #fff; }
    .nav-btn.secondary { background: #f0f0f0; color: #333; }
    .nav-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      padding: 20px;
    }

    .modal-content {
      background: white;
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
      border-bottom: 1px solid #f0f0f0;
    }

    .modal-header h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
    .btn-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #999; }

    .modal-body { padding: 30px; }
    .description { color: #666; margin-bottom: 25px; line-height: 1.5; }

    .form-group { margin-bottom: 25px; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .form-group input { width: 100%; padding: 15px; border-radius: 12px; border: 2px solid #f0f0f0; font-size: 1rem; font-weight: 600; transition: all 0.2s; }
    .form-group input:focus { outline: none; border-color: #000; }

    .modal-footer { display: flex; gap: 15px; margin-top: 10px; }
    .btn-cancel, .btn-submit { flex: 1; padding: 14px; border-radius: 14px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; }
    .btn-cancel { background: #f8f8f8; color: #666; }
    .btn-submit { background: #000; color: #fff; }
    .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Success State Styles */
    .success-content {
      background: #fcfcfc;
      border: 1px solid #f0f0f0;
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 25px;
      text-align: center;
    }
    .code-display { margin-bottom: 20px; }
    .code-display label { font-size: 0.75rem; font-weight: 800; color: #aaa; text-transform: uppercase; }
    .code-value {
      font-size: 2rem;
      font-weight: 900;
      color: #000;
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
    .btn-copy-code { background: #fff; border: 1px solid #eee; color: #333; }
    .btn-copy-link { background: #000; color: #fff; }
    .btn-copy-code:hover, .btn-copy-link:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
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
    private cdr: ChangeDetectorRef
  ) {}

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
            timeout(10000),
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
              } else if (err.status) {
                errMsg += ` (Error ${err.status}: ${err.statusText || 'Servidor no disponible'})`;
              }
              this.toastService.error(errMsg, 5000);
              this.cdr.detectChanges();
            }
          });
      }
    } else if (this.modalMode === 'success') {
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
