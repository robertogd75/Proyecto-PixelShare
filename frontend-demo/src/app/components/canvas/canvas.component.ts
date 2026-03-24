import { Component, AfterViewInit, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, UrlSegment } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';
import { ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css']
})
export class CanvasComponent implements OnInit, AfterViewInit {
  @ViewChild('canvasElement', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;

  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  protected currentRoomId: number | undefined = undefined;

  public currentColor = '#000000';
  public brushSize = 5;
  public zoomLevel = 0.8;
  public minZoom = 0.3;
  public canvasTitle = 'Pizarra Privada';
  public currentRoomName = '';
  public currentRoomCode = '';
  public isHostClosed = false;
  public showGrid = false;
  public canvasWidth = 2828;  // A4 landscape: width = height * √2
  public canvasHeight = 2000;
  private lastPos: { x: number, y: number } | null = null;

  constructor(
    private pixelService: PixelService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.initCanvas();
    this.handleRouting();
  }

  ngAfterViewInit(): void {
    // DOM is fully rendered here — clientHeight is now accurate
    requestAnimationFrame(() => {
      this.fitZoom();
      this.zoomLevel = this.minZoom;
    });
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

      if (path === 'room') {
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
    const isRoom = this.currentRoomId !== undefined;

    if (isRoom) {
      this.canvasWidth = 5657;
      this.canvasHeight = 4000;
    }

    if (canvas.width !== this.canvasWidth || canvas.height !== this.canvasHeight) {
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      this.reinitCanvasSettings();
    }
    requestAnimationFrame(() => this.fitZoom());
  }

  /** Minimum zoom = exact height-fit so the canvas fills the viewport vertically with zero gray space. */
  private fitZoom(): void {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return;
    const canvas = this.canvasRef.nativeElement;
    this.minZoom = vp.clientHeight / canvas.height;
    if (this.zoomLevel < this.minZoom) this.zoomLevel = this.minZoom;
  }

  private reinitCanvasSettings(): void {
    if (this.ctx) {
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      // Fill background again since resizing clears it
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
    }
  }

  public changeCanvasSize(size: string): void {
    if (this.currentRoomId !== undefined) {
      this.toastService.info('En las salas el tamaño es fijo (5000x5000).');
      return;
    }

    switch(size) {
      case 'small':  this.canvasWidth = 1414; this.canvasHeight = 1000; break;
      case 'normal': this.canvasWidth = 2828; this.canvasHeight = 2000; break;
      case 'large':  this.canvasWidth = 4243; this.canvasHeight = 3000; break;
      case 'huge':   this.canvasWidth = 5657; this.canvasHeight = 4000; break;
    }

    this.resizeCanvas();
    this.toastService.success(`Tamaño cambiado a ${size}`);
    this.fitZoom();
    this.zoomLevel = this.minZoom;
  }

  private loadInitialState(): void {
    if (this.currentRoomId === undefined) return;

    this.pixelService.getPixels(this.currentRoomId).subscribe(pixels => {
      pixels.forEach(p => this.drawPixelLocally(p, false));
    });
  }

  private setupWebSocket(roomId?: number): void {
    this.pixelService.connect(roomId).subscribe(pixel => {
      // Basic safety check though backend now handles filtering
      if (pixel.type === 'HOST_CLOSED') {
        this.isHostClosed = true;
        this.toastService.info('El anfitrión ha cerrado la sala.', 5000);
        setTimeout(() => this.router.navigate(['/']), 4000);
      } else if (pixel.roomId === roomId || (roomId === undefined && !pixel.roomId)) {
        this.drawPixelLocally(pixel, false);
      }
    });
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    if (event.ctrlKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.zoomLevel = Math.min(Math.max(this.minZoom, this.zoomLevel + delta), 2.0);
    } else if (event.shiftKey) {
      event.preventDefault();
      this.viewportRef.nativeElement.scrollLeft += event.deltaY;
    }
  }

  public copyInviteUrl(): void {
    if (!this.currentRoomCode) return;
    const url = window.location.origin + '/room/' + this.currentRoomCode;
    this.copyToClipboard(url, '¡Enlace de invitación copiado!');
  }

  public copyInviteCode(): void {
    if (!this.currentRoomCode) return;
    this.copyToClipboard(this.currentRoomCode, '¡Código de sala copiado!');
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
      this.toastService.error('Error: No se pudo copiar. Por favor, cópialo manualmente.');
    }
    document.body.removeChild(textArea);
  }

  public startDrawing(event: any): void {
    this.isDrawing = true;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX || event.touches?.[0]?.clientX) - rect.left;
    const y = (event.clientY || event.touches?.[0]?.clientY) - rect.top;

    this.lastPos = {
      x: Math.floor(x / this.zoomLevel),
      y: Math.floor(y / this.zoomLevel)
    };
    this.draw(event);
  }

  public stopDrawing(): void {
    this.isDrawing = false;
    this.lastPos = null;
  }

  @HostListener('mousemove', ['$event'])
  @HostListener('touchmove', ['$event'])
  public draw(event: any): void {
    if (!this.isDrawing) return;
    if (event.type === 'touchmove') event.preventDefault();

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const clientX = event.clientX || event.touches?.[0]?.clientX;
    const clientY = event.clientY || event.touches?.[0]?.clientY;

    const x = Math.floor((clientX - rect.left) / this.zoomLevel);
    const y = Math.floor((clientY - rect.top) / this.zoomLevel);

    const pixel: Pixel = {
      x,
      y,
      color: this.currentColor,
      size: this.brushSize,
      roomId: this.currentRoomId
    };

    this.drawPixelLocally(pixel, true);
    this.pixelService.sendPixel(pixel);
  }

  private drawPixelLocally(pixel: Pixel, isLocal: boolean): void {
    if (isLocal) {
      this.ctx.strokeStyle = pixel.color;
      this.ctx.lineWidth = pixel.size || 5;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      this.ctx.beginPath();
      if (this.lastPos) {
        this.ctx.moveTo(this.lastPos.x, this.lastPos.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      } else {
        this.ctx.moveTo(pixel.x, pixel.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      }
      this.ctx.stroke();
      this.lastPos = { x: pixel.x, y: pixel.y };
    } else {
      // For remote pixels, we draw points to avoid connecting different users
      this.ctx.fillStyle = pixel.color;
      this.ctx.beginPath();
      this.ctx.arc(pixel.x, pixel.y, (pixel.size || 5) / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  get gridBackgroundImage(): string {
    // Compensate line thickness so lines are always visible regardless of zoom.
    // At zoom 0.5x a 2px line renders as 1 screen pixel; at zoom 0.1x a 10px line renders as 1 screen pixel.
    const lw = Math.max(1, Math.ceil(1 / this.zoomLevel));
    return `linear-gradient(rgba(0,0,0,0.5) ${lw}px, transparent ${lw}px),
            linear-gradient(90deg, rgba(0,0,0,0.5) ${lw}px, transparent ${lw}px)`;
  }

  public toggleGrid(): void {
    this.showGrid = !this.showGrid;
    // We don't clear the canvas because we don't want to lose drawings.
    // Instead, the grid will be a CSS background on the container for performance.
  }

  public clearCanvas(): void {
    if (confirm('¿Estás seguro de que quieres borrar tu pizarra personal?')) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx.fillStyle = 'white';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
}
