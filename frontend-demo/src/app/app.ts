import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <nav class="navbar navbar-dark bg-dark mb-4">
      <div class="container">
        <span class="navbar-brand mb-0 h1">PixelShare Wall 🎨</span>
      </div>
    </nav>
    <main>
      <router-outlet></router-outlet>
    </main>
  `
})
export class App {}
