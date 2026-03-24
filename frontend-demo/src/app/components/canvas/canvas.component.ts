import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css']
})
export class CanvasComponent implements OnInit {
  @ViewChild('canvasElement', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private currentRoomId: number | undefined = undefined; // undefined = Private (not saved)
  
  public currentColor = '#000000';
  public brushSize = 5;
  public canvasTitle = 'Pizarra Privada';

  constructor(
    private pixelService: PixelService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initCanvas();
    this.handleRouting();
    this.setupWebSocket();
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resizeCanvas();
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private handleRouting(): void {
    this.route.url.subscribe(url => {
      const path = url[0]?.path;
      if (path === 'global') {
        this.currentRoomId = 0;
        this.canvasTitle = 'Pizarra Global (Colaborativa)';
        this.loadInitialState();
      } else if (path === 'room') {
        const code = url[1]?.path;
        this.pixelService.getRoom(code).subscribe(room => {
          if (room) {
            this.currentRoomId = room.id;
            this.canvasTitle = `Sala: ${room.name}`;
            this.loadInitialState();
          }
        });
      } else {
        this.currentRoomId = undefined; // Private
        this.canvasTitle = 'Pizarra Privada (Solo tú)';
      }
    });
  }

  @HostListener('window:resize')
  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const isGlobal = this.currentRoomId === 0;
    
    // For Global/Rooms, make it "Enormous" by allowing overflow
    canvas.width = isGlobal ? 5000 : window.innerWidth * 0.95;
    canvas.height = isGlobal ? 5000 : window.innerHeight * 0.8;
    
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private loadInitialState(): void {
    if (this.currentRoomId === undefined) return;
    
    this.pixelService.getPixels(this.currentRoomId).subscribe(pixels => {
      pixels.forEach(p => this.drawPixelLocally(p));
    });
  }

  private setupWebSocket(): void {
    this.pixelService.connect().subscribe(pixel => {
      // Filter incoming pixels by roomId
      if (pixel.roomId === this.currentRoomId) {
        this.drawPixelLocally(pixel);
      }
    });
  }

  public startDrawing(event: MouseEvent | TouchEvent): void {
    this.isDrawing = true;
    this.draw(event);
  }

  public stopDrawing(): void {
    this.isDrawing = false;
    this.ctx.beginPath();
  }

  public draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const pixel: Pixel = {
      x: Math.round(x),
      y: Math.round(y),
      color: this.currentColor,
      size: this.brushSize,
      roomId: this.currentRoomId
    };

    this.drawPixelLocally(pixel);
    
    // Only broadcast if not in private mode
    if (this.currentRoomId !== undefined) {
      this.pixelService.sendPixel(pixel);
    }
  }

  private drawPixelLocally(pixel: Pixel): void {
    this.ctx.fillStyle = pixel.color;
    this.ctx.beginPath();
    this.ctx.arc(pixel.x, pixel.y, (pixel.size || 5) / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  public clearCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
