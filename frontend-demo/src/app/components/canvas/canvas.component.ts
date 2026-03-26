import { Component, AfterViewInit, ElementRef, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, UrlSegment } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';
import { ToastService } from '../../services/toast.service';
import { finalize, Subscription, Subject, Observable } from 'rxjs';
import { ThemeService } from '../../services/theme.service';
import { DownloadService } from '../../services/download.service';
import { DrawingStateService } from '../../services/drawing-state.service';





@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css']
})
export class CanvasComponent implements OnInit, AfterViewInit {
  @ViewChild('canvasElement', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tempCanvas', { static: true }) tempCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;

  private ctx!: CanvasRenderingContext2D;
  private tempCtx!: CanvasRenderingContext2D;
  public isDrawing = false;
  public currentRoomId: number | undefined = undefined;

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
  public toolbarVisible = true;
  public canvasWidth = 2828;  // A4 landscape: width = height * √2
  public canvasHeight = 2000;
  
  public selectedTool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' = 'brush';

  private startPos: { x: number, y: number } | null = null;
  private lastPos: { x: number, y: number } | null = null;

  public get darkMode(): boolean {
    return this.themeService.currentTheme === 'dark';
  }


  // Custom cursor state
  public cursorX = 0;
  public cursorY = 0;
  public cursorVisible = false;

  /** Tracks whether the physical mouse button is pressed anywhere on the page */
  private mouseButtonPressed = false;

  /** The canvas-wrapper uses cursor:none — we draw our own visible cursor instead */
  get canvasCursor(): string { return 'none'; }

  /** Pixel size of the brush preview circle in screen pixels */
  get cursorSize(): number { return Math.max(8, this.brushSize * this.zoomLevel); }

  /** Base background color for the canvas based on theme */
  get themeBgColor(): string {
    return this.darkMode ? '#000000' : '#ffffff';
  }

  /** Cursor border color: contrast ring so it's always visible on any background */
  get cursorBorderColor(): string {
    if (this.selectedTool === 'eraser') return this.darkMode ? '#fff' : '#666';
    return this.darkMode ? '#fff' : this.currentColor;
  }

  constructor(
    private pixelService: PixelService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService,
    private themeService: ThemeService,
    private downloadService: DownloadService,
    private drawingStateService: DrawingStateService,
    private cdr: ChangeDetectorRef
  ) {}





  public allowAllDraw = false;
  public allowAllClear = false;
  public showSettingsMenu = false;
  public showToolMenu = false;
  
  // Exit & Download States
  public showExitConfirm = false;
  public showDownloadMenu = false;
  public downloadFilename = 'mi-pizarra';
  public downloadFormat: 'png' | 'jpg' = 'png';
  private downloadSub?: Subscription;

  // Navigation Guard States
  private _isDirty = false;
  get isDirty(): boolean { return this._isDirty; }
  set isDirty(val: boolean) {
    this._isDirty = val;
    this.drawingStateService.setDirty(val);
    
    // Create a history trap when the board becomes dirty
    // This allows us to intercept the browser "Back" button even when leaving the site
    if (val && !this.hasHistoryTrap) {
      this.hasHistoryTrap = true;
      history.pushState({ type: 'drawing-protection' }, '');
    } else if (!val && this.hasHistoryTrap) {
      // If we are cleaned, and we were trapped, we should ideally go back...
      // but that's messy. We just clear the flag and trust the next navigation.
      this.hasHistoryTrap = false;
    }
  }

  private navigateAnyway$ = new Subject<boolean>();
  private triggeredByGuard = false;
  private isRouterNavigating = false;
  private exitAfterDownload = false;
  private hasHistoryTrap = false;







  get canUserDraw(): boolean {
    return this.currentRoomId === undefined || this.isRoomHost || this.allowAllDraw;
  }

  get canUserClear(): boolean {
    return this.currentRoomId === undefined || this.isRoomHost || this.allowAllClear;
  }

  ngOnInit(): void {
    this.currentColor = '#000000';
    this.handleRouting();

    // Sync drawing color and refill canvas when theme changes
    this.themeService.theme$.subscribe(theme => {
      const isDark = theme === 'dark';
      if (isDark && this.currentColor === '#000000') {
        this.currentColor = '#ffffff';
      } else if (!isDark && this.currentColor === '#ffffff') {
        this.currentColor = '#000000';
      }
      
      // We must wait for the next tick for CSS variables to update and for the canvas to be ready
      setTimeout(() => {
        if (this.ctx) {
          this.refillCanvasBackground();
        }
      }, 0);
    });

    // Handle global download requests from Navbar
    this.downloadSub = this.downloadService.downloadRequest$.subscribe(() => {
      this.openDownloadMenu();
    });

    // Handle remote confirmation requests (e.g. from Navbar)
    this.drawingStateService.requestConfirm$.subscribe(() => {
      this.showExitConfirm = true;
      this.cdr.detectChanges();
    });
  }


  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.isDirty && this.hasHistoryTrap) {
      // The browser already went "Back" one step. 
      // We immediately push the state back to stay on the page and show our modal.
      history.pushState({ type: 'drawing-protection' }, '');
      this.showExitConfirm = true;
      this.cdr.detectChanges();
    } else {
      this.hasHistoryTrap = false;
    }
  }

  @HostListener('window:beforeunload', ['$event'])

  unloadNotification($event: any): void {
    // Only show the native browser dialog if we are NOT currently handled by the Angular router guard
    // and NOT explicitly bypassing it (e.g. for a confirmed page reload).
    if (this.isDirty && !this.isRouterNavigating && !this.drawingStateService.bypassBeforeUnload) {
      $event.returnValue = true;
    }
  }




  public canDeactivate(): Observable<boolean> | boolean {
    if (!this.isDirty) return true;
    
    // Create a fresh subject for this specific navigation attempt
    this.triggeredByGuard = true;
    this.isRouterNavigating = true; // Block the native beforeunload dialog for this router event
    this.navigateAnyway$ = new Subject<boolean>();
    this.showExitConfirm = true;
    
    // Return the observable that will emit when user makes a choice in the modal
    return this.navigateAnyway$.pipe(
      finalize(() => {
        this.triggeredByGuard = false;
        this.isRouterNavigating = false; // Unblock native protection after decision
      })
    );
  }







  ngAfterViewInit(): void {
    this.initCanvas();
    // DOM is fully rendered here — clientHeight is now accurate
    requestAnimationFrame(() => {
      this.fitZoom();
      this.zoomLevel = this.minZoom;
    });
  }

  get isDrawRestricted(): boolean {
    return this.currentRoomId !== undefined && !this.isRoomHost && !this.allowAllDraw;
  }

  get isClearRestricted(): boolean {
    return this.currentRoomId !== undefined && !this.isRoomHost && !this.allowAllClear;
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    
    const tCanvas = this.tempCanvasRef.nativeElement;
    this.tempCtx = tCanvas.getContext('2d')!;
    
    this.resizeCanvas();
    this.ctx.fillStyle = this.themeBgColor;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.tempCtx.lineCap = 'round';
    this.tempCtx.lineJoin = 'round';
  }

  private handleRouting(): void {
    this.route.url.subscribe((url: UrlSegment[]) => {
      const path = url[0]?.path;
      this.currentRoomName = '';
      this.currentRoomCode = '';

      if (path === 'room') {
        const code = url[1]?.path;
        if (!code) {
          this.router.navigate(['/']);
          return;
        }

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
              this.refillCanvasBackground();

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
    const tCanvas = this.tempCanvasRef.nativeElement;

    if (canvas.width !== this.canvasWidth || canvas.height !== this.canvasHeight) {
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      tCanvas.width = this.canvasWidth;
      tCanvas.height = this.canvasHeight;
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
      this.ctx.fillStyle = this.themeBgColor;
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
      pixels.forEach(p => {
        if (p.type === 'FILL') {
          this.floodFill(p.x, p.y, p.color, true);
        } else {
          this.drawPixelLocally(p, false);
        }
      });
    });
  }


  private setupWebSocket(roomId?: number): void {
    this.pixelService.connect(roomId).subscribe(pixel => {
    // Process special types
    if (pixel.type === 'HOST_CLOSED') {
      this.isHostClosed = true;
      this.isDirty = false;
      setTimeout(() => this.router.navigate(['/']), 4000);
      return;
    }

    if (pixel.type === 'FILL') {
      this.floodFill(pixel.x, pixel.y, pixel.color, true);
      return;
    }
    if (pixel.type === 'SETTINGS_UPDATE') {
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
        this.ctx.fillStyle = this.themeBgColor;
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);

      } else if (pixel.type === 'RECT' || pixel.type === 'CIRCLE' || pixel.type === 'LINE') {
        this.drawShapeLocally(pixel);
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
    // Show confirmation modal instead of leaving immediately
    this.showExitConfirm = true;
  }

  public confirmLeave(): void {
    this.showExitConfirm = false;
    const wasGuarded = this.triggeredByGuard;
    this.isDirty = false; // Allow navigation now
    
    // Notify any remote requester (like Navbar) that we are good to go
    this.drawingStateService.sendResponse(true);
    
    this.navigateAnyway$.next(true);
    this.navigateAnyway$.complete();
    
    // If we were NOT already navigating (e.g. they clicked the toolbar button), 
    // we need to trigger the navigation to home manually.
    if (!wasGuarded) {
      this.router.navigate(['/']);
    }
  }



  public cancelLeave(): void {
    this.showExitConfirm = false;
    this.showDownloadMenu = false;
    this.drawingStateService.sendResponse(false);
    this.navigateAnyway$.next(false);
    this.navigateAnyway$.complete();
  }




  public openDownloadMenu(shouldExit: boolean = false): void {
    this.exitAfterDownload = shouldExit;
    this.showDownloadMenu = true;
  }


  public downloadCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    
    // Create a temporary canvas for the export (to ensure background is included)
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d')!;

    // 1. Fill background (explicitly, because the main canvas might have transparency issues in exported formats like JPG)
    exportCtx.fillStyle = this.themeBgColor;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // 2. Draw the main canvas content
    exportCtx.drawImage(canvas, 0, 0);

    // 3. Trigger download
    const dataUrl = exportCanvas.toDataURL(`image/${this.downloadFormat}`, this.downloadFormat === 'jpg' ? 0.9 : 1.0);
    const link = document.createElement('a');
    link.download = `${this.downloadFilename}.${this.downloadFormat}`;
    link.href = dataUrl;
    link.click();

    this.toastService.success('Dibujo descargado correctamente');
    this.showDownloadMenu = false;
    
    // Once downloaded, it's no longer "dirty" until they draw again
    this.isDirty = false;
    
    if (this.exitAfterDownload) {
      this.exitAfterDownload = false;
      this.confirmLeave();
    } else {
      this.drawingStateService.sendResponse(false); // Stay here
      this.navigateAnyway$.next(false); // Stay after download if they were prompted
      this.navigateAnyway$.complete();
    }
  }






  public toggleSettingsMenu(): void {
    this.showSettingsMenu = !this.showSettingsMenu;
    if (this.showSettingsMenu) this.showToolMenu = false;
  }

  /** Refills the canvas with the current theme background color without clearing drawings (caution: this fills the base layer) */
  private refillCanvasBackground(): void {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const prevStrokeStyle = this.ctx.strokeStyle;
    this.ctx.fillStyle = this.themeBgColor;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.strokeStyle = prevStrokeStyle;
  }

  // Local theme toggle removed - moved to NavbarComponent


  public toggleToolMenu(): void {
    this.showToolMenu = !this.showToolMenu;
    if (this.showToolMenu) this.showSettingsMenu = false;
  }

  public selectTool(tool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill'): void {
    this.selectedTool = tool;
    this.showToolMenu = false;
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

    this.isDirty = true; // Mark as dirty on first local action


    const pos = this.getEventPos(event);
    this.isDrawing = true;
    this.startPos = pos;
    this.lastPos = pos;

    if (this.selectedTool === 'brush' || this.selectedTool === 'eraser') {
      this.drawPixelLocally({
        x: pos.x,
        y: pos.y,
        color: this.selectedTool === 'eraser' ? '#FFFFFF' : this.currentColor,
        size: this.brushSize,
        roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
      }, true);
    } else if (this.selectedTool === 'fill') {
      this.floodFill(pos.x, pos.y, this.currentColor);
      const fillPixel: Pixel = {
        x: pos.x, y: pos.y, color: this.currentColor,
        type: 'FILL',
        roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
      };
      this.pixelService.sendPixel(fillPixel);
      this.isDrawing = false; // Fill is a single action, not a continuous draw
    }
  }

  /** Stop drawing and cancel any in-progress shape without finalizing it (used on mouseleave) */
  public cancelDrawing(): void {
    this.isDrawing = false;
    this.lastPos = null;
    this.startPos = null;
    this.cursorVisible = false;
    this.tempCtx?.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  /** Single window-level mousemove handler with explicit canvas bounds checking */
  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                   event.clientY >= rect.top  && event.clientY <= rect.bottom;

    // Update cursor preview
    this.cursorVisible = inside;
    if (inside) {
      this.cursorX = event.clientX - rect.left;
      this.cursorY = event.clientY - rect.top;
    }

    // Auto-stop drawing when leaving canvas bounds
    if (!inside && this.isDrawing) {
      this.cancelDrawing();
      return;
    }

    // Draw only when inside and the mouse button is physically held
    if (inside && this.mouseButtonPressed && this.isDrawing && this.canUserDraw) {
      this.draw(event);
    }
  }

  @HostListener('document:mousedown')
  onDocumentMouseDown(): void {
    this.mouseButtonPressed = true;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.mouseButtonPressed = false;
    if (this.isDrawing) {
      this.stopDrawing();
    }
  }

  public stopDrawing(): void {
    if (!this.isDrawing) return;

    if (this.selectedTool !== 'brush' && this.selectedTool !== 'eraser') {
      this.finalizeShape();
    }

    this.isDrawing = false;
    this.lastPos = null;
    this.startPos = null;
    this.tempCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  public draw(event: any): void {
    if (!this.isDrawing || !this.canUserDraw) return;
    if (event.type === 'touchmove') event.preventDefault();

    const pos = this.getEventPos(event);

    if (this.selectedTool === 'brush' || this.selectedTool === 'eraser') {
      const pixel: Pixel = {
        x: pos.x,
        y: pos.y,
        fromX: this.lastPos?.x,
        fromY: this.lastPos?.y,
        color: this.selectedTool === 'eraser' ? this.themeBgColor : this.currentColor,
        size: this.brushSize,
        roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
      };
      this.drawPixelLocally(pixel, true);
      this.lastPos = pos;
    } else {
      this.lastPos = pos; // Cache latest pos for finalizeShape
      this.drawPreview(pos);
    }
  }

  private drawPreview(currentPos: { x: number, y: number }): void {
    if (!this.startPos) return;
    this.tempCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.tempCtx.beginPath();
    this.tempCtx.strokeStyle = this.currentColor;
    this.tempCtx.lineWidth = this.brushSize;

    const x = this.startPos.x;
    const y = this.startPos.y;
    const w = currentPos.x - x;
    const h = currentPos.y - y;

    if (this.selectedTool === 'line') {
      this.tempCtx.moveTo(x, y);
      this.tempCtx.lineTo(currentPos.x, currentPos.y);
    } else if (this.selectedTool === 'rect') {
      this.tempCtx.strokeRect(x, y, w, h);
    } else if (this.selectedTool === 'circle') {
      const radius = Math.sqrt(w * w + h * h);
      this.tempCtx.arc(x, y, radius, 0, 2 * Math.PI);
    }
    this.tempCtx.stroke();
  }

  private finalizeShape(): void {
    if (!this.startPos || !this.lastPos || !this.canUserDraw) return;
    
    const pixel: Pixel = {
      x: this.startPos.x,
      y: this.startPos.y,
      width: this.lastPos.x - this.startPos.x,
      height: this.lastPos.y - this.startPos.y,
      fromX: this.startPos.x,
      fromY: this.startPos.y,
      size: this.brushSize,
      color: this.currentColor,
      type: this.selectedTool.toUpperCase(),
      roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
    };

    if (this.selectedTool === 'line') {
      pixel.x = this.lastPos.x;
      pixel.y = this.lastPos.y;
      pixel.fromX = this.startPos.x;
      pixel.fromY = this.startPos.y;
    }

    this.drawShapeLocally(pixel);
    this.pixelService.sendPixel(pixel);
  }

  private drawShapeLocally(pixel: Pixel): void {
    this.ctx.beginPath();
    this.ctx.strokeStyle = pixel.color;
    this.ctx.lineWidth = pixel.size || 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (pixel.type === 'LINE') {
      this.ctx.moveTo(pixel.fromX!, pixel.fromY!);
      this.ctx.lineTo(pixel.x, pixel.y);
    } else if (pixel.type === 'RECT') {
      this.ctx.strokeRect(pixel.x, pixel.y, pixel.width!, pixel.height!);
    } else if (pixel.type === 'CIRCLE') {
      const radius = Math.sqrt(pixel.width! * pixel.width! + pixel.height! * pixel.height!);
      this.ctx.arc(pixel.x, pixel.y, radius, 0, 2 * Math.PI);
    }
    this.ctx.stroke();
  }

  private drawPixelLocally(pixel: Pixel, isLocal: boolean): void {
    this.ctx.strokeStyle = pixel.color;
    this.ctx.lineWidth = pixel.size || 5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    if (isLocal) {
      this.isDirty = true;
      // Local: use current drawing path

      if (this.lastPos) {
        this.ctx.moveTo(this.lastPos.x, this.lastPos.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      } else {
        this.ctx.moveTo(pixel.x, pixel.y);
        this.ctx.lineTo(pixel.x, pixel.y);
      }
      this.lastPos = { x: pixel.x, y: pixel.y };
    } else {
      // Remote: use provided start point
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
    const lw = Math.max(1, Math.ceil(1 / this.zoomLevel));
    const gridColor = this.darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
    return `linear-gradient(${gridColor} ${lw}px, transparent ${lw}px),
            linear-gradient(90deg, ${gridColor} ${lw}px, transparent ${lw}px)`;
  }

  public toggleGrid(): void {
    this.showGrid = !this.showGrid;
    // We don't clear the canvas because we don't want to lose drawings.
    // Instead, the grid will be a CSS background on the container for performance.
  }

  public showClearConfirm = false;

  public clearCanvas(): void {
    if (!this.canUserClear) {
        this.toastService.info('El anfitrión ha restringido la limpieza de pizarra.');
        return;
    }
    this.showClearConfirm = true;
  }

  public confirmClear(): void {
    this.showClearConfirm = false;
    this.isDirty = false; // Canvas is clean now
    const canvas = this.canvasRef.nativeElement;

    this.ctx.fillStyle = this.themeBgColor;
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

  private floodFill(startX: number, startY: number, fillColor: string, isRemote = false): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Convert CSS color to RGBA components using a temporary canvas to get precise numbers
    const tempCtx = document.createElement('canvas').getContext('2d');
    if (!tempCtx) return;
    tempCtx.fillStyle = fillColor;
    const resolvedColor = tempCtx.fillStyle; // Browser resolved color (e.g. #000000)
    
    // Read the pixel to get actual RGBA from browser
    tempCtx.fillRect(0, 0, 1, 1);
    const targetData = tempCtx.getImageData(0, 0, 1, 1).data;
    const [r, g, b, a] = targetData;
    
    // Create a 32-bit integer for the target color
    // This is ABGR on little-endian systems (typical for browsers)
    const targetColor = (a << 24) | (b << 16) | (g << 8) | r;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data32 = new Uint32Array(imageData.data.buffer);
    
    const startIdx = startY * canvas.width + startX;
    const startColor = data32[startIdx];

    // If already the same color, no work needed
    if (startColor === targetColor) return;

    const stack: [number, number][] = [[startX, startY]];
    const width = canvas.width;
    const height = canvas.height;

    while (stack.length > 0) {
      const point = stack.pop();
      if (!point) continue;
      const [x, y] = point;

      const idx = y * width + x;
      if (data32[idx] === startColor) {
        data32[idx] = targetColor;

        // Push neighbors (using simple 4-way fill for robustness)
        if (x > 0) stack.push([x - 1, y]);
        if (x < width - 1) stack.push([x + 1, y]);
        if (y > 0) stack.push([x, y - 1]);
        if (y < height - 1) stack.push([x, y + 1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.isDirty = true;
  }

  private getEventPos(event: any): { x: number, y: number } {

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    
    // Get client coordinates for both mouse and touch
    let clientX: number;
    let clientY: number;

    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    // Ratio-based coordinate calculation (Ultra-robust)
    // We calculate the percentage of where the user clicked within the VISUAL element
    // and then apply that percentage to the NATIVE canvas resolution.
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;

    return {
      x: Math.floor(relX * canvas.width),
      y: Math.floor(relY * canvas.height)
    };
  }
}
