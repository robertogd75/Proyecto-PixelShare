import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, UrlSegment } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css']
})
export class CanvasComponent implements OnInit {
  @ViewChild('canvasElement', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private currentRoomId: number | undefined = undefined;
  
  public currentColor = '#000000';
  public brushSize = 5;
  public zoomLevel = 1.0;
  public canvasTitle = 'Pizarra Privada';
  public currentRoomName = '';
  public currentRoomCode = '';

  constructor(
    private pixelService: PixelService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initCanvas();
    this.handleRouting();
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resizeCanvas();
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private handleRouting(): void {
    this.route.url.subscribe((url: UrlSegment[]) => {
      const path = url[0]?.path;
      this.currentRoomName = '';
      this.currentRoomCode = '';
      
      if (path === 'global') {
        this.currentRoomId = 1; // Global ID in DB
        this.currentRoomName = 'Global';
        this.canvasTitle = 'Pizarra Global (Colaborativa)';
        this.loadInitialState();
        this.setupWebSocket(this.currentRoomId);
      } else if (path === 'room') {
        const code = url[1]?.path;
        this.pixelService.getRoom(code).subscribe(room => {
          if (room) {
            this.currentRoomId = room.id;
            this.currentRoomName = room.name;
            this.currentRoomCode = room.code;
            this.canvasTitle = `Sala: ${room.name}`;
            this.loadInitialState();
            this.setupWebSocket(this.currentRoomId);
          }
        });
      } else {
        this.currentRoomId = undefined; // Private
        this.currentRoomName = 'Privada';
        this.canvasTitle = 'Pizarra Privada (Solo tú)';
        this.loadInitialState();
        this.setupWebSocket(this.currentRoomId);
      }
    });
  }

  @HostListener('window:resize')
  public resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const isGlobalOrRoom = this.currentRoomId !== undefined;
    
    // Always use large canvas if in a room or global
    canvas.width = isGlobalOrRoom ? 5000 : window.innerWidth * 0.95;
    canvas.height = isGlobalOrRoom ? 5000 : window.innerHeight * 0.8;
    
    if (this.ctx) {
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }
  }

  private loadInitialState(): void {
    if (this.currentRoomId === undefined) return;
    
    this.pixelService.getPixels(this.currentRoomId).subscribe(pixels => {
      pixels.forEach(p => this.drawPixelLocally(p));
    });
  }

  private setupWebSocket(roomId?: number): void {
    this.pixelService.connect(roomId).subscribe(pixel => {
      // Basic safety check though backend now handles filtering
      if (pixel.roomId === roomId || (roomId === undefined && !pixel.roomId)) {
        this.drawPixelLocally(pixel);
      }
    });
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    if (event.ctrlKey) {
      event.preventDefault(); // Prevent browser zoom
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.zoomLevel = Math.min(Math.max(0.1, this.zoomLevel + delta), 2.0);
    }
  }

  public copyInviteUrl(): void {
    if (!this.currentRoomCode) return;
    const url = window.location.origin + '/room/' + this.currentRoomCode;
    navigator.clipboard.writeText(url).then(() => {
      alert('¡Enlace de invitación copiado al portapapeles!');
    });
  }

  public copyInviteCode(): void {
    if (!this.currentRoomCode) return;
    navigator.clipboard.writeText(this.currentRoomCode).then(() => {
      alert('¡Código de sala copiado al portapapeles!');
    });
  }

  public startDrawing(event: any): void {
    this.isDrawing = true;
    this.draw(event);
  }

  public stopDrawing(): void {
    this.isDrawing = false;
  }

  @HostListener('mousemove', ['$event'])
  public draw(event: any): void {
    if (!this.isDrawing) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    
    // Adjust coordinates for zoom level
    const x = Math.floor((event.clientX - rect.left) / this.zoomLevel);
    const y = Math.floor((event.clientY - rect.top) / this.zoomLevel);

    const pixel: Pixel = { 
      x, 
      y, 
      color: this.currentColor, 
      size: this.brushSize,
      roomId: this.currentRoomId 
    };
    
    this.drawPixelLocally(pixel);
    this.pixelService.sendPixel(pixel);
  }

  private drawPixelLocally(pixel: Pixel): void {
    this.ctx.fillStyle = pixel.color;
    this.ctx.beginPath();
    this.ctx.arc(pixel.x, pixel.y, pixel.size || 5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  public clearCanvas(): void {
    if (confirm('¿Estás seguro de que quieres borrar tu pizarra personal?')) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}
