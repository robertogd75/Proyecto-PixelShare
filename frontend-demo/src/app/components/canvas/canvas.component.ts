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
  public isRoomHost = false;
  public canvasWidth = 2828;  // A4 landscape: width = height * √2
  public canvasHeight = 2000;
  private lastPos: { x: number, y: number } | null = null;

  constructor(
    private pixelService: PixelService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService
  ) {}

  public allowAllDraw = false;
  public allowAllClear = false;
  public showSettingsMenu = false;

  get canUserDraw(): boolean {
    return this.currentRoomId === undefined || this.isRoomHost || this.allowAllDraw;
  }

  get canUserClear(): boolean {
    return this.currentRoomId === undefined || this.isRoomHost || this.allowAllClear;
  }

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
        this.pixelService.getRoom(code).subscribe({
          next: room => {
            if (room && room.id) {
              this.currentRoomId = room.id;
              this.currentRoomName = room.name;
              this.currentRoomCode = room.code;
              this.canvasTitle = `Sala: ${room.name}`;
              this.isRoomHost = sessionStorage.getItem('pixelshare_host_room') === room.code;
              this.canvasWidth = 5657;
              this.canvasHeight = 4000;
              this.resizeCanvas();
              this.loadInitialState();
              this.setupWebSocket(this.currentRoomId);
            } else {
              this.toastService.error('Sala no encontrada. Comprueba el código e inténtalo de nuevo.');
              this.router.navigate(['/']);
            }
          },
          error: () => {
            this.toastService.error('Sala no encontrada. Comprueba el código e inténtalo de nuevo.');
            this.router.navigate(['/']);
          }
        });
      } else {
        this.currentRoomId = undefined; // Private
        this.currentRoomName = 'Privada';
        this.canvasTitle = 'Pizarra Privada';
        this.loadInitialState();
        this.setupWebSocket(this.currentRoomId);
      }
    });
  }

  @HostListener('window:resize')
  public resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;

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
    if (this.currentRoomId !== undefined && !this.isRoomHost) {
      this.toastService.info('Solo el anfitrión puede cambiar el tamaño de la sala.');
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

    // Broadcast size change to all room participants
    if (this.currentRoomId !== undefined) {
      const resizeMsg: Pixel = {
        x: 0, y: 0, color: '',
        type: 'RESIZE',
        width: this.canvasWidth,
        height: this.canvasHeight,
        roomId: this.currentRoomId
      };
      this.pixelService.sendPixel(resizeMsg);
    }
  }

  private loadInitialState(): void {
    if (this.currentRoomId === undefined) return;

    this.pixelService.getPixels(this.currentRoomId).subscribe(pixels => {
      pixels.forEach(p => this.drawPixelLocally(p, false));
    });
  }

  private setupWebSocket(roomId?: number): void {
    this.pixelService.connect(roomId).subscribe(pixel => {
      if (pixel.type === 'HOST_CLOSED') {
        this.isHostClosed = true;
        this.toastService.info('El anfitrión ha cerrado la sala.', 5000);
        setTimeout(() => this.router.navigate(['/']), 4000);
      } else if (pixel.type === 'SETTINGS_UPDATE') {
        this.allowAllDraw = !!pixel.allowAllDraw;
        this.allowAllClear = !!pixel.allowAllClear;
        if (!this.isRoomHost) {
            this.toastService.info('Ajustes de sala actualizados por el anfitrión.');
        }
      } else if (pixel.type === 'RESIZE' && pixel.width && pixel.height) {
        this.canvasWidth = pixel.width;
        this.canvasHeight = pixel.height;
        this.resizeCanvas();
        this.fitZoom();
      } else if (pixel.type === 'CLEAR') {
        const canvas = this.canvasRef.nativeElement;
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);
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

  public leaveRoom(): void {
    this.router.navigate(['/']);
  }

  public toggleSettingsMenu(): void {
    this.showSettingsMenu = !this.showSettingsMenu;
  }

  public updateRoomSettings(): void {
    if (!this.isRoomHost || this.currentRoomId === undefined) return;
    
    const settingsMsg: Pixel = {
      x: 0, y: 0, color: '',
      type: 'SETTINGS_UPDATE',
      roomId: this.currentRoomId,
      allowAllDraw: this.allowAllDraw,
      allowAllClear: this.allowAllClear
    };
    this.pixelService.sendPixel(settingsMsg);
    this.toastService.success('Ajustes guardados');
  }

  public startDrawing(event: any): void {
    if (!this.canUserDraw) {
        this.toastService.info('El anfitrión ha restringido el dibujo a esta sala.');
        return;
    }
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
    if (!this.isDrawing || !this.canUserDraw) return;
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
      fromX: this.lastPos?.x,
      fromY: this.lastPos?.y,
      color: this.currentColor,
      size: this.brushSize,
      roomId: this.currentRoomId
    };

    this.drawPixelLocally(pixel, true);
    this.pixelService.sendPixel(pixel);
  }

  private drawPixelLocally(pixel: Pixel, isLocal: boolean): void {
    this.ctx.strokeStyle = pixel.color;
    this.ctx.lineWidth = pixel.size || 5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    if (isLocal) {
      // Local: use the tracked lastPos for connection
      if (this.lastPos) {
        this.ctx.moveTo(this.lastPos.x, this.lastPos.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      } else {
        this.ctx.moveTo(pixel.x, pixel.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      }
      this.lastPos = { x: pixel.x, y: pixel.y };
    } else {
      // Remote: use fromX/fromY only if they are actual numbers (not null/undefined)
      if (pixel.fromX != null && pixel.fromY != null) {
        this.ctx.moveTo(pixel.fromX, pixel.fromY);
        this.ctx.lineTo(pixel.x, pixel.y);
      } else {
        this.ctx.moveTo(pixel.x, pixel.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      }
    }
    this.ctx.stroke();
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

  public showClearConfirm = false;
  public toolbarVisible = true;

  public clearCanvas(): void {
    if (!this.canUserClear) {
        this.toastService.info('El anfitrión ha restringido la limpieza de pizarra.');
        return;
    }
    this.showClearConfirm = true;
  }

  public confirmClear(): void {
    this.showClearConfirm = false;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.toastService.success('Pizarra borrada correctamente');

    // Broadcast clear to all room participants
    if (this.currentRoomId !== undefined) {
      const clearMsg: Pixel = {
        x: 0, y: 0, color: '',
        type: 'CLEAR',
        roomId: this.currentRoomId
      };
      this.pixelService.sendPixel(clearMsg);
    }
  }

  public cancelClear(): void {
    this.showClearConfirm = false;
  }
}
