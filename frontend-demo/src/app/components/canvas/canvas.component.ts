import { Component, AfterViewInit, ElementRef, HostListener, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, UrlSegment } from '@angular/router';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';
import { ToastService } from '../../services/toast.service';
import { Subscription, Subject, Observable, finalize } from 'rxjs';
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
  public canvasTitle = 'Pizarra';
  public currentRoomName = '';
  public currentRoomCode = '';
  public isHostClosed = false;
  public showGrid = false;
  public isRoomHost = false;
  public toolbarVisible = true;
  private canvasBuffer: Uint32Array | null = null;
  public canvasWidth = 2828;
  public canvasHeight = 2000;
  private cachedRect: DOMRect | null = null;

  public selectedTool: 'brush' | 'eraser' | 'line' | 'rect' | 'circle' | 'fill' = 'brush';
  public isFilling = false;
  private startPos: { x: number, y: number } | null = null;
  private lastPos: { x: number, y: number } | null = null;

  public get darkMode() { return this.themeService.currentTheme === 'dark'; }
  public cursorX = 0; public cursorY = 0; public cursorVisible = false;
  private mouseButtonPressed = false;

  get themeBgColor() { return this.darkMode ? '#000000' : '#ffffff'; }
  get canvasCursor() { return 'none'; }
  get cursorSize() { return Math.max(8, this.brushSize * this.zoomLevel); }
  get cursorBorderColor() { return this.darkMode ? '#fff' : (this.selectedTool === 'eraser' ? '#666' : this.currentColor); }

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

  public allowAllDraw = true; public allowAllClear = true;
  public showSettingsMenu = false; public showToolMenu = false;
  public showExitConfirm = false; public showDownloadMenu = false;
  public showClearConfirm = false;
  public downloadFilename = 'pizarra'; public downloadFormat: 'png' | 'jpg' = 'png';
  private _isDirty = false;
  get isDirty() { return this._isDirty; }
  set isDirty(v: boolean) { this._isDirty = v; this.drawingStateService.setDirty(v); }

  private incomingBuffer: Pixel[] = [];
  private localBuffer: Pixel[] = [];
  private outgoingBuffer: Pixel[] = [];
  private lastPulseTime = 0;
  private animationFrameId: number | null = null;
  private lastFillEvent: Pixel | null = null;
  private globalDirtyBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  get canUserDraw() { return this.currentRoomId === undefined || this.isRoomHost || this.allowAllDraw; }
  get canUserClear() { return this.currentRoomId === undefined || this.isRoomHost || this.allowAllClear; }

  ngOnInit() {
    this.handleRouting();
    this.themeService.theme$.subscribe(() => setTimeout(() => { if (this.ctx) this.reinit(); }, 0));
    this.downloadService.downloadRequest$.subscribe(() => this.showDownloadMenu = true);
    this.drawingStateService.requestConfirm$.subscribe(() => { this.showExitConfirm = true; this.cdr.detectChanges(); });
    this.renderLoop();
  }

  ngOnDestroy() { if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); if (this.currentRoomId !== undefined) this.pixelService.disconnect(this.currentRoomId); }

  @HostListener('window:popstate') onPopState() { if (this.isDirty) { history.pushState(null, ''); this.showExitConfirm = true; } }

  public canDeactivate(): Observable<boolean> | boolean {
    if (!this.isDirty) return true;
    this.showExitConfirm = true;
    return new Subject<boolean>().asObservable(); 
  }

  ngAfterViewInit() { this.initCanvas(); requestAnimationFrame(() => { this.fitZoom(); this.zoomLevel = this.minZoom; }); }

  private initCanvas() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d', { alpha: false })!;
    this.tempCtx = this.tempCanvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
  }

  private colorToUint32(hex: string): number {
    if (!hex || hex.length < 7) return 0xFF000000;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  private initBuffer() {
    this.canvasBuffer = new Uint32Array(this.canvasWidth * this.canvasHeight);
    this.canvasBuffer.fill(this.colorToUint32(this.themeBgColor));
  }

  private handleRouting() {
    this.route.url.subscribe(url => {
      const path = url[0]?.path;
      if (path === 'room') {
        const code = url[1]?.path; if (!code) return;
        this.pixelService.getRoom(code).subscribe(room => {
          if (room && room.id) {
            this.currentRoomId = room.id; this.currentRoomCode = room.code; this.currentRoomName = room.name;
            this.isRoomHost = sessionStorage.getItem('pixelshare_host_room') === room.code;
            this.canvasWidth = 5657; this.canvasHeight = 4000; this.resizeCanvas();
            this.loadInitial(); this.setupWS(room.id);
          }
        });
      } else { this.currentRoomId = undefined; this.loadInitial(); this.setupWS(); }
    });
  }

  public resizeCanvas() {
    this.canvasRef.nativeElement.width = this.canvasWidth; this.canvasRef.nativeElement.height = this.canvasHeight;
    this.tempCanvasRef.nativeElement.width = this.canvasWidth; this.tempCanvasRef.nativeElement.height = this.canvasHeight;
    this.initBuffer(); this.reinit();
  }

  private reinit() {
    if (this.ctx) {
      this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
      this.ctx.fillStyle = this.themeBgColor; this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }

  private fitZoom() {
    const vp = this.viewportRef?.nativeElement;
    if (vp) { this.minZoom = vp.clientHeight / this.canvasHeight; if (this.zoomLevel < this.minZoom) this.zoomLevel = this.minZoom; }
  }

  public changeCanvasSize(size: string) {
    if (this.currentRoomId !== undefined && !this.isRoomHost) return;
    if (size === 'small') { this.canvasWidth = 1414; this.canvasHeight = 1000; }
    else if (size === 'normal') { this.canvasWidth = 2828; this.canvasHeight = 2000; }
    else if (size === 'large') { this.canvasWidth = 4243; this.canvasHeight = 3000; }
    else if (size === 'huge') { this.canvasWidth = 5657; this.canvasHeight = 4000; }
    this.resizeCanvas();
    if (this.currentRoomId) this.pixelService.sendPixel({ x:0, y:0, color:'', type:'RESIZE', width:this.canvasWidth, height:this.canvasHeight, roomId:this.currentRoomId });
  }

  private loadInitial() { if (this.currentRoomId) this.pixelService.getPixels(this.currentRoomId).subscribe(px => this.processHistory(px)); }

  private processHistory(pixels: Pixel[]) {
    let idx = 0;
    const process = async () => {
      const start = performance.now(); let mod = false; let minX = this.canvasWidth, minY = this.canvasHeight, maxX = 0, maxY = 0;
      while (idx < pixels.length && performance.now() - start < 32) {
        const p = pixels[idx++];
        if (p.type === 'FILL') {
          const r = await this.execFloodFill(this.canvasBuffer!, p.x, p.y, p.color, this.canvasWidth, this.canvasHeight);
          if (r) { minX = Math.min(minX, r.minX); minY = Math.min(minY, r.minY); maxX = Math.max(maxX, r.maxX); maxY = Math.max(maxY, r.maxY); mod = true; }
        } else if (p.type === 'CLEAR') this.confirmClear();
        else this.incomingBuffer.push(p);
      }
      if (mod) this.ctx.putImageData(new ImageData(new Uint8ClampedArray(this.canvasBuffer!.buffer as any as ArrayBuffer), this.canvasWidth, this.canvasHeight), 0, 0, minX, minY, maxX-minX+1, maxY-minY+1);
      if (idx < pixels.length) requestAnimationFrame(process);
    };
    process();
  }

  private renderLoop() {
    const start = performance.now();
    while (this.localBuffer.length > 0) this.drawBatch(this.localBuffer.splice(0, 50));
    while (this.incomingBuffer.length > 0 && performance.now() - start < 8) {
      const f = this.incomingBuffer[0];
      if (f.type && f.type !== 'BRUSH') this.drawShape(this.incomingBuffer.shift()!);
      else if (f.type === 'FILL') this.floodFill(f.x, f.y, f.color, true), this.incomingBuffer.shift();
      else {
        const batch: Pixel[] = [], sid = f.roomId, col = f.color, siz = f.size;
        while (this.incomingBuffer.length > 0 && this.incomingBuffer[0].roomId === sid && this.incomingBuffer[0].color === col && this.incomingBuffer[0].size === siz && !this.incomingBuffer[0].type) {
          batch.push(this.incomingBuffer.shift()!); if (batch.length > 50) break;
        }
        if (batch.length > 0) this.drawBatch(batch);
      }
    }
    if (performance.now() - this.lastPulseTime > 30 && this.outgoingBuffer.length > 0) {
      this.pixelService.sendPixels([...this.outgoingBuffer]); this.outgoingBuffer = []; this.lastPulseTime = performance.now();
    }
    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  private drawBatch(px: Pixel[]) {
    if (!px.length) return; const p1 = px[0];
    this.ctx.strokeStyle = p1.color; this.ctx.lineWidth = p1.size || 5; this.ctx.beginPath();
    const c32 = this.colorToUint32(p1.color);
    px.forEach(p => {
      if (p.fromX != null) this.ctx.moveTo(p.fromX!, p.fromY!); else this.ctx.moveTo(p.x, p.y);
      this.ctx.lineTo(p.x, p.y);
      if (this.canvasBuffer) { const i = Math.floor(p.y) * this.canvasWidth + Math.floor(p.x); if (i >= 0 && i < this.canvasBuffer.length) this.canvasBuffer[i] = c32; }
      this.updateDirty(p.x, p.y, p.size || 5);
    });
    this.ctx.stroke();
  }

  private updateDirty(x: number, y: number, s: number) {
    const p = s + 10;
    this.globalDirtyBounds.minX = Math.min(this.globalDirtyBounds.minX, x - p); this.globalDirtyBounds.minY = Math.min(this.globalDirtyBounds.minY, y - p);
    this.globalDirtyBounds.maxX = Math.max(this.globalDirtyBounds.maxX, x + p); this.globalDirtyBounds.maxY = Math.max(this.globalDirtyBounds.maxY, y + p);
  }

  private setupWS(rid?: number) { this.pixelService.connect(rid).subscribe(d => Array.isArray(d) ? d.forEach(p => this.handleWS(p, rid)) : this.handleWS(d, rid)); }
  private handleWS(p: Pixel, rid?: number) {
    if (p.type === 'INIT_PIXELS') this.processHistory(p.pixelHistory!);
    else if (p.type === 'FILL') this.floodFill(p.x, p.y, p.color, true);
    else if (p.type === 'CLEAR') this.confirmClear();
    else if (p.roomId === rid || (!rid && !p.roomId)) this.incomingBuffer.push(p);
  }

  private isLastFillOurs(p: Pixel) { return this.lastFillEvent && p.x === this.lastFillEvent.x && p.y === this.lastFillEvent.y; }

  public leaveRoom() { this.showExitConfirm = true; }
  public confirmLeave() { this.isDirty = false; this.router.navigate(['/']); }

  public downloadCanvas() {
    const c = this.canvasRef.nativeElement; const ex = document.createElement('canvas'); ex.width = c.width; ex.height = c.height;
    const ctx = ex.getContext('2d')!; ctx.fillStyle = this.themeBgColor; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(c,0,0);
    const a = document.createElement('a'); a.download = 'dibujo.png'; a.href = ex.toDataURL(); a.click();
  }

  public selectTool(t: any) { this.selectedTool = t; }

  public startDrawing(e: any) {
    if (!this.canUserDraw) return; const pos = this.getPos(e); this.isDrawing = true; this.startPos = pos; this.lastPos = pos;
    this.cachedRect = this.canvasRef.nativeElement.getBoundingClientRect();
    if (this.selectedTool === 'brush' || this.selectedTool === 'eraser') {
      const p = { x: pos.x, y: pos.y, color: this.selectedTool === 'eraser' ? this.themeBgColor : this.currentColor, size: this.brushSize, roomId: this.currentRoomId };
      this.localBuffer.push(p); this.outgoingBuffer.push(p);
    } else if (this.selectedTool === 'fill') {
      this.syncPending(); this.floodFill(pos.x, pos.y, this.currentColor);
      this.outgoingBuffer.push({ x: pos.x, y: pos.y, color: this.currentColor, type: 'FILL', roomId: this.currentRoomId });
      this.isDrawing = false;
    }
  }

  @HostListener('window:mousemove', ['$event']) onMouseMove(e: MouseEvent) {
    const r = this.cachedRect || this.canvasRef.nativeElement.getBoundingClientRect();
    const inC = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    this.cursorVisible = inC; if (inC) { this.cursorX = e.clientX - r.left; this.cursorY = e.clientY - r.top; }
    if (inC && this.mouseButtonPressed && this.isDrawing) this.draw(e);
  }

  @HostListener('document:mousedown') onMouseDown() { this.mouseButtonPressed = true; }
  @HostListener('document:mouseup') onMouseUp() { this.mouseButtonPressed = false; if (this.isDrawing) this.stopDrawing(); }

  private stopDrawing() { this.isDrawing = false; this.tempCtx.clearRect(0,0,this.canvasWidth,this.canvasHeight); }
  private draw(e: any) {
    const pos = this.getPos(e);
    if (this.selectedTool === 'brush' || this.selectedTool === 'eraser') {
      const p = { x: pos.x, y: pos.y, fromX: this.lastPos?.x, fromY: this.lastPos?.y, color: this.selectedTool === 'eraser' ? this.themeBgColor : this.currentColor, size: this.brushSize, roomId: this.currentRoomId };
      this.localBuffer.push(p); this.outgoingBuffer.push(p); this.lastPos = pos; this.isDirty = true;
    } else this.preview(pos);
  }

  private preview(pos: any) {
    this.tempCtx.clearRect(0,0,this.canvasWidth,this.canvasHeight); this.tempCtx.beginPath(); this.tempCtx.strokeStyle = this.currentColor;
    const x = this.startPos!.x, y = this.startPos!.y, w = pos.x-x, h = pos.y-y;
    if (this.selectedTool === 'line') { this.tempCtx.moveTo(x,y); this.tempCtx.lineTo(pos.x,pos.y); }
    else if (this.selectedTool === 'rect') this.tempCtx.strokeRect(x,y,w,h);
    else if (this.selectedTool === 'circle') this.tempCtx.arc(x,y,Math.sqrt(w*w+h*h), 0, 2*Math.PI);
    this.tempCtx.stroke();
  }

  private drawShape(p: Pixel) {
    this.ctx.beginPath(); this.ctx.strokeStyle = p.color; this.ctx.lineWidth = p.size || 2;
    if (p.type === 'LINE') { this.ctx.moveTo(p.fromX!, p.fromY!); this.ctx.lineTo(p.x, p.y); }
    else if (p.type === 'RECT') this.ctx.strokeRect(p.x, p.y, p.width!, p.height!);
    this.ctx.stroke(); this.syncRegion(p.x-10, p.y-10, (p.width||0)+20, (p.height||0)+20);
  }

  private syncPending() { const b = this.globalDirtyBounds; if (b.minX !== Infinity) { this.syncRegion(b.minX, b.minY, b.maxX-b.minX, b.maxY-b.minY); this.globalDirtyBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; } }
  private syncRegion(x: number, y: number, w: number, h: number) {
    const sX = Math.max(0, Math.floor(x)), sY = Math.max(0, Math.floor(y)), fW = Math.min(this.canvasWidth-sX, Math.ceil(w)), fH = Math.min(this.canvasHeight-sY, Math.ceil(h));
    if (fW <= 0 || fH <= 0 || !this.canvasBuffer) return;
    const d32 = new Uint32Array(this.ctx.getImageData(sX, sY, fW, fH).data.buffer);
    for (let r = 0; r < fH; r++) this.canvasBuffer.set(d32.subarray(r*fW, (r+1)*fW), (sY+r)*this.canvasWidth+sX);
  }

  public confirmClear() { this.ctx.fillStyle = this.themeBgColor; this.ctx.fillRect(0,0,this.canvasWidth,this.canvasHeight); if (this.canvasBuffer) this.canvasBuffer.fill(this.colorToUint32(this.themeBgColor)); }
  public updateRoomSettings() { if (this.currentRoomId) this.pixelService.sendPixel({ x:0, y:0, color:'', type:'SETTINGS_UPDATE', roomId:this.currentRoomId, allowAllDraw:this.allowAllDraw, allowAllClear:this.allowAllClear }); }
  public toggleSettingsMenu() { this.showSettingsMenu = !this.showSettingsMenu; } public openDownloadMenu(exit = false) { this.showDownloadMenu = true; } public copyInviteCode() { navigator.clipboard.writeText(this.currentRoomCode); } public copyInviteUrl() { navigator.clipboard.writeText(window.location.origin + '/room/' + this.currentRoomCode); }
  public cancelClear() { this.showClearConfirm = false; } public clearCanvas() { if (this.canUserClear) this.showClearConfirm = true; } public cancelLeave() { this.showExitConfirm = false; this.showDownloadMenu = false; }

  private floodFill(x: number, y: number, c: string, remote = false): Promise<void> {
    return new Promise(async res => {
      this.isFilling = true; const r = await this.execFloodFill(this.canvasBuffer!, x, y, c, this.canvasWidth, this.canvasHeight);
      if (r) this.ctx.putImageData(new ImageData(new Uint8ClampedArray(this.canvasBuffer!.buffer as any as ArrayBuffer), this.canvasWidth, this.canvasHeight), 0,0, r.minX, r.minY, r.maxX-r.minX+1, r.maxY-r.minY+1);
      this.isFilling = false; res();
    });
  }

  private async execFloodFill(d32: Uint32Array, sx: number, sy: number, fc: string, w: number, h: number): Promise<any> {
    const tc = this.colorToUint32(fc), sc = d32[sy*w+sx]; if (sc === tc) return null;
    let minX = sx, maxX = sx, minY = sy, maxY = sy; const stack: number[] = [sx, sy];
    while (stack.length > 0) {
      const y = stack.pop()!, x = stack.pop()!; let l = x, r = x;
      while (l > 0 && d32[y*w+(l-1)] === sc) l--; while (r < w-1 && d32[y*w+(r+1)] === sc) r++;
      minX = Math.min(minX, l); maxX = Math.max(maxX, r); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let i = l; i <= r; i++) d32[y*w+i] = tc;
      for (let i = l; i <= r; i++) {
        if (y > 0 && d32[(y-1)*w+i] === sc) { stack.push(i, y-1); while(i < r && d32[(y-1)*w+(i+1)] === sc) i++; }
        if (y < h-1 && d32[(y+1)*w+i] === sc) { stack.push(i, y+1); while(i < r && d32[(y+1)*w+(i+1)] === sc) i++; }
      }
    }
    return { minX, minY, maxX, maxY };
  }

  private getPos(e: any) {
    const r = this.canvasRef.nativeElement.getBoundingClientRect(); let cx = e.clientX, cy = e.clientY; if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    return { x: Math.floor(((cx-r.left)/r.width)*this.canvasWidth), y: Math.floor(((cy-r.top)/r.height)*this.canvasHeight) };
  }
}
