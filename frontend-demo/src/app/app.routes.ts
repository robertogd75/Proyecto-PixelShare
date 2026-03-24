import { Routes } from '@angular/router';
import { CanvasComponent } from './components/canvas/canvas.component';

export const routes: Routes = [
  { path: '', component: CanvasComponent },
  { path: 'global', component: CanvasComponent },
  { path: 'room/:code', component: CanvasComponent },
  { path: '**', redirectTo: '' }
];
