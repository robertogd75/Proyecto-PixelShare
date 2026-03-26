import { Routes } from '@angular/router';
import { CanvasComponent } from './components/canvas/canvas.component';
import { leaveRoomGuard } from './guards/leave-room.guard';


export const routes: Routes = [
  { path: '', component: CanvasComponent, canDeactivate: [leaveRoomGuard] },
  { path: 'room/:code', component: CanvasComponent, canDeactivate: [leaveRoomGuard] },
  { path: '**', redirectTo: '' }
];

