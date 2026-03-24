import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

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
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 90%;
      max-width: 800px;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      border-radius: 50px;
      padding: 10px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      z-index: 2000;
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
  constructor(private router: Router) {}

  onJoinRoom() {
    const code = prompt("Introduce el código de la sala:");
    if (code) {
      window.location.href = `/room/${code.toUpperCase()}`;
    }
  }

  onCreateRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const name = prompt("Nombre de la sala:");
    if (name) {
      window.location.href = `/room/${code}`;
    }
  }
}
