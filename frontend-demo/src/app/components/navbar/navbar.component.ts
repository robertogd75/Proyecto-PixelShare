import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { PixelService } from '../../services/pixel.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <nav class="glass-nav">
      <div class="logo">PixelShare</div>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Mi Pizarra</a>
        <a routerLink="/global" routerLinkActive="active">Mundial</a>
        <div class="room-actions">
          <button class="btn-secondary" (click)="openJoinModal()">Unirse</button>
          <button class="btn-primary" (click)="openCreateModal()">+ Crear Sala</button>
        </div>
      </div>
    </nav>

    <!-- Modal Overlay -->
    <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <h2>{{ modalTitle }}</h2>
        <p>{{ modalDescription }}</p>
        
          <div class="form-group" *ngIf="modalMode === 'create'">
            <label>Nombre de la sala</label>
            <input type="text" [(ngModel)]="roomName" placeholder="Escribe el nombre..." autofocus>
          </div>
          
          <div class="form-group" *ngIf="modalMode === 'join'">
            <label>Código de la sala</label>
            <input type="text" [(ngModel)]="roomCode" placeholder="AAAA-BBBB-CCCC" autofocus>
          </div>

          <!-- Success State -->
          <div class="success-content" *ngIf="modalMode === 'success'">
            <div class="code-display">
              <label>Código de Acceso</label>
              <div class="code-value">{{ inviteCode }}</div>
            </div>
            <button class="btn-copy-full" (click)="copyInvitation()">
              <span>📋 Copiar Enlace de Invitación</span>
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" (click)="closeModal()" *ngIf="modalMode !== 'success'">Cancelar</button>
          <button class="btn-submit" (click)="submitModal()" [disabled]="(modalMode === 'create' && !roomName) || (modalMode === 'join' && !roomCode)">
            {{ modalActionText }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .glass-nav {
      position: fixed;
      top: 25px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 800px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      border-radius: 50px;
      padding: 12px 35px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      z-index: 10000;
    }
    .logo { font-weight: 800; font-size: 1.2rem; color: #333; letter-spacing: -0.5px; }
    .nav-links { display: flex; gap: 25px; align-items: center; }
    .room-actions { display: flex; gap: 10px; }
    a { text-decoration: none; color: #666; font-weight: 600; font-size: 0.9rem; transition: color 0.3s; }
    a:hover, a.active { color: #000; }
    button { border: none; padding: 8px 18px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: #000; color: #fff; }
    .btn-secondary { background: #eee; color: #333; }
    button:hover:not(:disabled) { transform: scale(1.05); }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(8px);
      z-index: 20000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-content {
      background: white;
      padding: 30px;
      border-radius: 30px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      animation: modalEnter 0.3s ease-out;
    }
    @keyframes modalEnter {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    h2 { margin: 0 0 10px 0; font-weight: 800; color: #1a1a1a; }
    p { color: #666; font-size: 0.95rem; margin-bottom: 25px; }
    .form-group { margin-bottom: 25px; }
    label { display: block; font-size: 0.8rem; font-weight: 700; color: #999; text-transform: uppercase; margin-bottom: 8px; }
    input {
      width: 100%;
      padding: 12px 20px;
      border-radius: 15px;
      border: 2px solid #eee;
      font-size: 1rem;
      font-weight: 600;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #000; }
    .modal-footer { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-cancel { background: #f5f5f5; color: #666; }
    .btn-submit { background: #000; color: #fff; }
    .btn-submit:disabled { opacity: 0.3; cursor: not-allowed; }

    /* Success State Styles */
    .success-content {
      text-align: center;
      padding: 10px 0;
    }
    .code-display {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 20px;
      margin-bottom: 20px;
      border: 2px dashed #ddd;
    }
    .code-value {
      font-family: 'Courier New', Courier, monospace;
      font-size: 1.5rem;
      font-weight: 800;
      color: #000;
      letter-spacing: 2px;
      margin-top: 10px;
    }
    .btn-copy-full {
      width: 100%;
      background: #000;
      color: #fff;
      padding: 15px;
      border-radius: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: transform 0.2s;
    }
    .btn-copy-full:hover { transform: translateY(-2px); }
  `]
})
export class NavbarComponent {
  showModal = false;
  modalMode: 'join' | 'create' | 'success' = 'create';
  roomName = '';
  roomCode = '';
  inviteCode = '';

  get modalTitle() { 
    if (this.modalMode === 'success') return '¡Sala Creada con Éxito!';
    return this.modalMode === 'create' ? 'Crear Nueva Sala' : 'Unirse a Sala'; 
  }
  get modalDescription() { 
    if (this.modalMode === 'success') return 'Comparte el código o el enlace con tus amigos para empezar a pintar juntos.';
    return this.modalMode === 'create' 
      ? 'Crea un espacio privado para pintar con tus amigos.' 
      : 'Escribe el código de la sala para entrar.';
  }
  get modalActionText() { 
    if (this.modalMode === 'success') return 'Ir a la Sala';
    return this.modalMode === 'create' ? 'Crear Sala' : 'Entrar'; 
  }

  constructor(private router: Router, private pixelService: PixelService) {}

  openJoinModal() {
    this.modalMode = 'join';
    this.roomCode = '';
    this.showModal = true;
  }

  openCreateModal() {
    this.modalMode = 'create';
    this.roomName = '';
    this.showModal = true;
  }

  closeModal() {
    if (this.modalMode === 'success') {
      this.router.navigateByUrl(`/room/${this.inviteCode}`);
    }
    this.showModal = false;
  }

  submitModal() {
    if (this.modalMode === 'join') {
      if (this.roomCode) {
        this.router.navigateByUrl(`/room/${this.roomCode.toUpperCase().trim()}`);
        this.closeModal();
      }
    } else if (this.modalMode === 'create') {
      if (this.roomName) {
        const code = this.generateSecureCode();
        this.pixelService.createRoom({ code, name: this.roomName }).subscribe(room => {
          this.inviteCode = room.code;
          this.modalMode = 'success';
        });
      }
    } else {
      this.closeModal();
    }
  }

  copyInvitation() {
    const url = window.location.origin + '/room/' + this.inviteCode;
    navigator.clipboard.writeText(url).then(() => {
      alert('¡Enlace de invitación copiado al portapapeles!');
    });
  }

  private generateSecureCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result.match(/.{4}/g)?.join('-') || result;
  }
}
