import { Component, AfterViewInit, ElementRef, HostListener, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
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
export class CanvasComponent implements OnInit, AfterViewInit, OnDestroy {
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
  private canvasBuffer: Uint32Array | null = null;
  public canvasWidth = 2828;
  public canvasHeight = 2000;

  public selectedTool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' = 'brush';
  private isFilling = false;
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
  ) { }





  public allowAllDraw = true;
  public allowAllClear = true;
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
  private currentStrokeBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  private globalDirtyBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  // Throttling for collaborative performance
  private lastSendTime = 0;
  private lastSentPos: { x: number, y: number } | null = null;

  // Performance Architecture (v2): Frame-Aligned Rendering & Pulsed Emission
  private incomingBuffer: Pixel[] = [];
  private outgoingBuffer: Pixel[] = [];
  private lastPulseTime = 0;
  private animationFrameId: number | null = null;
  private lastFillEvent: Pixel | null = null;







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

    this.renderLoop(); // Start high-performance tick loop
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.currentRoomId !== undefined) {
      this.pixelService.disconnect(this.currentRoomId);
    }
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
    this.initBuffer();
    this.ctx.fillStyle = this.themeBgColor;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.tempCtx.lineCap = 'round';
    this.tempCtx.lineJoin = 'round';
  }

  private colorToUint32(fillColor: string): number {
    if (fillColor === this.lastFillColor) {
      return this.lastTargetColor32;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1; tempCanvas.height = 1;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.fillStyle = fillColor;
    tCtx.fillRect(0, 0, 1, 1);
    const data = tCtx.getImageData(0, 0, 1, 1).data;
    const targetColor = (data[3] << 24) | (data[2] << 16) | (data[1] << 8) | data[0];
    this.lastFillColor = fillColor;
    this.lastTargetColor32 = targetColor;
    return targetColor;
  }

  private initBuffer(): void {
    const size = this.canvasWidth * this.canvasHeight;
    this.canvasBuffer = new Uint32Array(size);
    // Fill buffer with background color (Correct colorInt from themeBgColor)
    const bgColorInt = this.colorToUint32(this.themeBgColor);
    this.canvasBuffer.fill(bgColorInt);
  }

  private updateBuffer(x: number, y: number, colorInt: number): void {
    if (!this.canvasBuffer || x < 0 || y < 0 || x >= this.canvasWidth || y >= this.canvasHeight) return;
    this.canvasBuffer[y * this.canvasWidth + x] = colorInt;
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
      this.initBuffer(); // Re-allocate shadow buffer
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

    switch (size) {
      case 'small': this.canvasWidth = 1414; this.canvasHeight = 1000; break;
      case 'normal': this.canvasWidth = 2828; this.canvasHeight = 2000; break;
      case 'large': this.canvasWidth = 4243; this.canvasHeight = 3000; break;
      case 'huge': this.canvasWidth = 5657; this.canvasHeight = 4000; break;
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
      this.processPixelQueue(pixels);
    });
  }

  /**
   * Processes the initial drawing history in chunks to prevent UI freezes.
   * Regular pixels are drawn in batches, while heavy 'FILL' actions are spaced out.
   */
  private processPixelQueue(pixels: Pixel[]): void {
    if (pixels.length === 0) return;

    // Robustness: Handle early initialization race conditions
    if (!this.ctx || !this.canvasRef) {
      setTimeout(() => this.processPixelQueue(pixels), 100);
      return;
    }

    let index = 0;
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;

    const process = async () => {
      const startTime = performance.now();

      // God-Mode: Use the persistent canvasBuffer directly
      if (!this.canvasBuffer) { this.initBuffer(); }
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      let batchModified = false;

      while (index < pixels.length && performance.now() - startTime < 32) {
        const p = pixels[index++];

        if (p.type === 'FILL') {
          const result = await this.executeFloodFillOnBuffer(this.canvasBuffer!, p.x, p.y, p.color, canvas.width, canvas.height, false);
          if (result) {
            minX = Math.min(minX, result.minX);
            minY = Math.min(minY, result.minY);
            maxX = Math.max(maxX, result.maxX);
            maxY = Math.max(maxY, result.maxY);
            batchModified = true;
          }
        } else if (p.type === 'CLEAR') {
          this.ctx.fillStyle = this.themeBgColor;
          this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
          this.canvasBuffer!.fill(this.colorToUint32(this.themeBgColor));
        } else if (p.type === 'RESIZE' && p.width && p.height) {
          this.canvasWidth = p.width;
          this.canvasHeight = p.height;
          this.resizeCanvas();
        } else {
          this.drawPixelLocally(p, false);
        }
      }

      // God-Mode surgical commit: only push modified area to GPU
      if (batchModified) {
        const dirtyW = maxX - minX + 1;
        const dirtyH = maxY - minY + 1;

        // Fix: Cast buffer to any then ArrayBuffer to satisfy TS environment
        const imageData = new ImageData(
          new Uint8ClampedArray(this.canvasBuffer!.buffer as any as ArrayBuffer),
          canvas.width,
          canvas.height
        );
        ctx.putImageData(imageData, 0, 0, minX, minY, dirtyW, dirtyH);
      }

      if (index < pixels.length) {
        requestAnimationFrame(process);
      } else {
        this.isDirty = false;
      }
    };

    process();
  }

  /**
   * Performance Architecture (v2): Tick-system Render Loop
   * Drains the incoming buffer and pulses the outgoing buffer.
   */
  private renderLoop(): void {
    // 1. Process Incoming Batch
    if (this.incomingBuffer.length > 0) {
      const batch = [...this.incomingBuffer];
      this.incomingBuffer = [];
      batch.forEach(p => this.drawPixelLocally(p, false));
    }

    // 2. Pulsed Outgoing Emission (30ms pulse)
    const now = performance.now();
    if (now - this.lastPulseTime > 30 && this.outgoingBuffer.length > 0) {
      const batch = [...this.outgoingBuffer];
      this.outgoingBuffer = [];
      this.pixelService.sendPixels(batch);
      this.lastPulseTime = now;
    }

    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  private isLastFillOurs(pixel: Pixel): boolean {
    if (!this.lastFillEvent) return false;
    return pixel.x === this.lastFillEvent.x &&
      pixel.y === this.lastFillEvent.y &&
      pixel.color === this.lastFillEvent.color;
  }




  private setupWebSocket(roomId?: number): void {
    this.pixelService.connect(roomId).subscribe(data => {
      // Handle both single pixel objects and batched pixel arrays (Overdrive Architecture)
      if (Array.isArray(data)) {
        data.forEach(p => this.handleIncomingPixel(p, roomId));
      } else {
        this.handleIncomingPixel(data, roomId);
      }
    });
  }

  private handleIncomingPixel(pixel: Pixel, roomId?: number): void {
    // Process special types
    if (pixel.type === 'INIT_PIXELS' && pixel.pixelHistory) {
      console.log(`Syncing ${pixel.pixelHistory.length} pixels from history...`);
      this.processPixelQueue(pixel.pixelHistory);
      return;
    }

    if (pixel.type === 'HOST_CLOSED') {
      this.isHostClosed = true;
      this.isDirty = false;
      setTimeout(() => this.router.navigate(['/']), 4000);
      return;
    }

    if (pixel.type === 'FILL') {
      // Overdrive: Filter self-broadcasted fills
      if (this.isLastFillOurs(pixel)) return;
      this.floodFill(pixel.x, pixel.y, pixel.color, true);
    } else if (pixel.type === 'RECT' || pixel.type === 'CIRCLE' || pixel.type === 'LINE') {
      this.drawShapeLocally(pixel);
    } else if (pixel.roomId === roomId || (roomId === undefined && !pixel.roomId)) {
      // High Performance: Queue pixel for frame-aligned rendering
      this.incomingBuffer.push(pixel);
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
      if (this.canvasBuffer) this.canvasBuffer.fill(this.colorToUint32(this.themeBgColor));
    }
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

    // If we are host and explicitly leaving, terminate the room for everyone
    if (this.isRoomHost && this.currentRoomId !== undefined) {
      this.pixelService.sendPixel({
        x: 0, y: 0, color: '',
        type: 'TERMINATE_ROOM',
        roomId: this.currentRoomId
      });
    }

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

    // Reset stroke bounds for a new stroke
    this.currentStrokeBounds = { minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y };

    if (this.selectedTool === 'brush' || this.selectedTool === 'eraser') {
      this.drawPixelLocally({
        x: pos.x,
        y: pos.y,
        color: this.selectedTool === 'eraser' ? '#FFFFFF' : this.currentColor,
        size: this.brushSize,
        roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
      }, true);
    } else if (this.selectedTool === 'fill') {
      if (this.isFilling) return;
      this.lastLocalFillX = pos.x;
      this.lastLocalFillY = pos.y;
      this.lastLocalFillColor = this.currentColor;

      // Lazy Sync: Only sync the buffer RIGHT BEFORE we need to fill
      this.syncPendingBuffer();

      this.floodFill(pos.x, pos.y, this.currentColor);
      const fillPixel: Pixel = {
        x: pos.x, y: pos.y, color: this.currentColor,
        type: 'FILL',
        roomId: this.currentRoomId ? Number(this.currentRoomId) : undefined
      };
      this.lastFillEvent = fillPixel;
      this.outgoingBuffer.push(fillPixel);
      this.isDrawing = false; // Fill is a single action
    }

    if (this.isDrawing) {
      this.lastSentPos = null; // Prepare for first stroke point
      this.lastSendTime = 0;
      const pad = (this.brushSize || 5) + 5;
      this.currentStrokeBounds = {
        minX: pos.x - pad,
        minY: pos.y - pad,
        maxX: pos.x + pad,
        maxY: pos.y + pad
      };
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
      event.clientY >= rect.top && event.clientY <= rect.bottom;

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
    this.lastSentPos = null;
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
      this.lastPos = pos;
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
    this.outgoingBuffer.push(pixel);
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

    // Surgical sync for shapes
    let x = pixel.x, y = pixel.y, w = pixel.width || 0, h = pixel.height || 0;
    if (pixel.type === 'CIRCLE') {
      const radius = Math.sqrt(w * w + h * h);
      x -= radius; y -= radius; w = radius * 2; h = radius * 2;
    } else if (pixel.type === 'LINE') {
      x = Math.min(pixel.x, pixel.fromX!);
      y = Math.min(pixel.y, pixel.fromY!);
      w = Math.abs(pixel.x - pixel.fromX!);
      h = Math.abs(pixel.y - pixel.fromY!);
    }
    const pad = (pixel.size || 2) + 2;
    this.syncBufferRegion(x - pad, y - pad, w + pad * 2, h + pad * 2);
  }

  private drawPixelLocally(pixel: Pixel, isLocal: boolean): void {
    this.ctx.strokeStyle = pixel.color;
    this.ctx.lineWidth = pixel.size || 5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    if (pixel.fromX != null && pixel.fromY != null) {
      this.ctx.moveTo(pixel.fromX, pixel.fromY);
    } else {
      this.ctx.moveTo(pixel.x, pixel.y);
    }
    this.ctx.lineTo(pixel.x, pixel.y);
    this.ctx.stroke();

    // Expand dirty bounds for Lazy Sync (Always, so the Bucket tool knows what to sync)
    const pad = (pixel.size || 5) + 10;
    const x = Math.min(pixel.x, pixel.fromX ?? pixel.x) - pad;
    const y = Math.min(pixel.y, pixel.fromY ?? pixel.y) - pad;
    const w = Math.abs(pixel.x - (pixel.fromX ?? pixel.x)) + pad * 2;
    const h = Math.abs(pixel.y - (pixel.fromY ?? pixel.y)) + pad * 2;
    this.updateDirtyBounds(x, y, w, h);

    if (isLocal) {
      this.isDirty = true;
      // Send for collaboration via pulsed buffer
      this.outgoingBuffer.push(pixel);
    }
  }

  private updateDirtyBounds(x: number, y: number, w: number, h: number): void {
    this.globalDirtyBounds.minX = Math.min(this.globalDirtyBounds.minX, x);
    this.globalDirtyBounds.minY = Math.min(this.globalDirtyBounds.minY, y);
    this.globalDirtyBounds.maxX = Math.max(this.globalDirtyBounds.maxX, x + w);
    this.globalDirtyBounds.maxY = Math.max(this.globalDirtyBounds.maxY, y + h);
  }

  private syncPendingBuffer(): void {
    const b = this.globalDirtyBounds;
    if (b.minX !== Infinity) {
      this.syncBufferRegion(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      // Reset dirty bounds
      this.globalDirtyBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    }
  }

  private syncBufferRegion(x: number, y: number, w: number, h: number): void {
    if (!this.canvasBuffer) return;
    const canvas = this.canvasRef.nativeElement;

    // Clamp to canvas boundaries
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(canvas.width, Math.ceil(x + w));
    const endY = Math.min(canvas.height, Math.ceil(y + h));
    const finalW = endX - startX;
    const finalH = endY - startY;

    if (finalW <= 0 || finalH <= 0) return;

    try {
      const regionData = this.ctx.getImageData(startX, startY, finalW, finalH);
      const region32 = new Uint32Array(regionData.data.buffer);

      for (let row = 0; row < finalH; row++) {
        const targetOffset = (startY + row) * this.canvasWidth + startX;
        const sourceOffset = row * finalW;
        this.canvasBuffer.set(region32.subarray(sourceOffset, sourceOffset + finalW), targetOffset);
      }
    } catch (e) {
      console.warn("Surgical sync failed", e);
    }
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
    if (this.canvasBuffer) {
      this.canvasBuffer.fill(this.colorToUint32(this.themeBgColor));
    }
    this.toastService.success('Pizarra borrada correctamente');

    // Broadcast clear to all room participants
    if (this.currentRoomId !== undefined) {
      const clearMsg: Pixel = {
        x: 0, y: 0, color: '',
        type: 'CLEAR',
        roomId: this.currentRoomId
      };
      this.outgoingBuffer.push(clearMsg);
    }
  }

  public cancelClear(): void {
    this.showClearConfirm = false;
  }

  private lastFillColor: string = '';
  private lastTargetColor32: number = 0;
  private lastLocalFillX: number = -1;
  private lastLocalFillY: number = -1;
  private lastLocalFillColor: string = '';



  private floodFill(startX: number, startY: number, fillColor: string, isRemote = false): Promise<void> {
    return new Promise(async (resolve) => {
      // isFilling prevents overlapping local fills
      if (this.isFilling && !isRemote) {
        resolve();
        return;
      }

      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(); return; }

      this.isFilling = true;

      try {
        const width = canvas.width;
        const height = canvas.height;
        if (!this.canvasBuffer) { this.initBuffer(); }

        // God-Mode: Use the persistent shadow buffer directly. No getImageData!
        const result = await this.executeFloodFillOnBuffer(this.canvasBuffer!, startX, startY, fillColor, width, height, true);

        if (result) {
          const dirtyW = result.maxX - result.minX + 1;
          const dirtyH = result.maxY - result.minY + 1;

          // God-Mode: surgical commit
          const imageData = new ImageData(
            new Uint8ClampedArray(this.canvasBuffer!.buffer as any as ArrayBuffer),
            width,
            height
          );
          ctx.putImageData(imageData, 0, 0, result.minX, result.minY, dirtyW, dirtyH);
          this.isDirty = true;
        }
      } catch (err) {
        console.error('Flood fill failed', err);
      } finally {
        this.isFilling = false;
        resolve();
      }
    });
  }

  /**
   * Overdrive Core: Performs flood fill algorithms directly on a 32-bit buffer.
   * This is used by both the UI (floodFill) and the Batch History Processor.
   */
  private async executeFloodFillOnBuffer(
    data32: Uint32Array,
    startX: number,
    startY: number,
    fillColor: string,
    width: number,
    height: number,
    yieldEnabled: boolean = false
  ): Promise<{ minX: number, minY: number, maxX: number, maxY: number } | null> {

    let targetColor: number;
    if (fillColor === this.lastFillColor) {
      targetColor = this.lastTargetColor32;
    } else {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 1; tempCanvas.height = 1;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.fillStyle = fillColor;
      tCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = tCtx.getImageData(0, 0, 1, 1).data;
      targetColor = (a << 24) | (b << 16) | (g << 8) | r;
      this.lastFillColor = fillColor;
      this.lastTargetColor32 = targetColor;
    }

    const startIdx = startY * width + startX;
    const startColor = data32[startIdx];

    if (startColor === targetColor) return null;

    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;

    const stack: number[] = [startX, startY];
    let lastYieldTime = performance.now();
    let iterations = 0;
    const maxIter = 10000000;

    while (stack.length > 0 && iterations < maxIter) {
      iterations++;

      if (yieldEnabled && iterations % 1000 === 0) {
        if (performance.now() - lastYieldTime > 40) {
          await new Promise(r => setTimeout(r, 0));
          lastYieldTime = performance.now();
        }
      }

      const y = stack.pop()!;
      const x = stack.pop()!;

      let left = x, right = x;
      while (left > 0 && data32[y * width + (left - 1)] === startColor) left--;
      while (right < width - 1 && data32[y * width + (right + 1)] === startColor) right++;

      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let i = left; i <= right; i++) {
        data32[y * width + i] = targetColor;
      }

      if (y > 0) {
        let spanAdded = false;
        const yAbove = y - 1;
        for (let i = left; i <= right; i++) {
          if (data32[yAbove * width + i] === startColor) {
            if (!spanAdded) {
              stack.push(i, yAbove);
              spanAdded = true;
            }
          } else spanAdded = false;
        }
      }
      if (y < height - 1) {
        let spanAdded = false;
        const yBelow = y + 1;
        for (let i = left; i <= right; i++) {
          if (data32[yBelow * width + i] === startColor) {
            if (!spanAdded) {
              stack.push(i, yBelow);
              spanAdded = true;
            }
          } else spanAdded = false;
        }
      }
    }

    return { minX, minY, maxX, maxY };
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
