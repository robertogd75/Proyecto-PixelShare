import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="glass-nav">
      <div class="logo">PixelShare</div>
      <div class="nav-links">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Mi Pizarra</a>
        <a routerLink="/global" routerLinkActive="active">Global</a>
        <button class="btn-create" (click)="onCreateRoom()">+ Crear Sala</button>
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
      gap: 20px;
      align-items: center;
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
    .btn-create {
      background: #000;
      color: #fff;
      border: none;
      padding: 8px 18px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .btn-create:hover {
      transform: scale(1.05);
    }
  `]
})
export class NavbarComponent {
  onCreateRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const name = prompt("Nombre de la sala:");
    if (name) {
      // Logic to create room in backend would go here.
      // For now, let's just navigate to the route.
      window.location.href = `/room/${code}`;
    }
  }
}
