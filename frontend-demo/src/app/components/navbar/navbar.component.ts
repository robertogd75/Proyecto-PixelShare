import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

import { PixelService } from '../../services/pixel.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="glass-nav">
      <div class="logo">PixelShare</div>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Mi Pizarra</a>
        <a routerLink="/global" routerLinkActive="active">Mundial</a>
        <div class="room-actions">
          <button class="btn-secondary" (click)="onJoinRoom()">Unirse</button>
          <button class="btn-primary" (click)="onCreateRoom()">+ Crear Sala</button>
        </div>
      </div>
    </nav>
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
      z-index: 10000; /* Absolute top priority */
    }
    .logo {
      font-weight: 800;
      font-size: 1.2rem;
      color: #333;
      letter-spacing: -0.5px;
    }
    .nav-links {
      display: flex;
      gap: 25px;
      align-items: center;
    }
    .room-actions {
      display: flex;
      gap: 10px;
    }
    a {
      text-decoration: none;
      color: #666;
      font-weight: 600;
      font-size: 0.9rem;
      transition: color 0.3s;
    }
    a:hover, a.active {
      color: #000;
    }
    button {
      border: none;
      padding: 8px 18px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: transform 0.2s, background 0.2s;
    }
    .btn-primary {
      background: #000;
      color: #fff;
    }
    .btn-secondary {
      background: #eee;
      color: #333;
    }
    button:hover {
      transform: scale(1.05);
    }
  `]
})
export class NavbarComponent {
  constructor(private router: Router, private pixelService: PixelService) {}

  onJoinRoom() {
    const code = prompt("Introduce el código de la sala:");
    if (code) {
      this.router.navigateByUrl(`/room/${code.toUpperCase()}`);
    }
  }

  onCreateRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const name = prompt("Nombre de la sala:");
    if (name) {
      this.pixelService.createRoom({ code, name }).subscribe(room => {
        this.router.navigateByUrl(`/room/${room.code}`);
      });
    }
  }
}
