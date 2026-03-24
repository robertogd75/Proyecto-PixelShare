import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PixelService } from '../../services/pixel.service';
import { Pixel } from '../../models/pixel.model';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './canvas.component.html',
  styleUrl: './canvas.component.css'
})
export class CanvasComponent implements AfterViewInit {
  @ViewChild('pixelCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  
  selectedColor = '#000000';
  brushSize = 5;

  constructor(private pixelService: PixelService) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.loadCanvas();
  }

  loadCanvas(): void {
    this.pixelService.getPixels().subscribe(pixels => {
      pixels.forEach(p => this.drawPixel(p.x, p.y, p.color, false));
    });
  }

  startDrawing(event: MouseEvent): void {
    this.isDrawing = true;
    this.draw(event);
  }

  stopDrawing(): void {
    this.isDrawing = false;
  }

  draw(event: MouseEvent): void {
    if (!this.isDrawing) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = Math.floor(event.clientX - rect.left);
    const y = Math.floor(event.clientY - rect.top);

    this.drawPixel(x, y, this.selectedColor, true);
  }

  private drawPixel(x: number, y: number, color: string, save: boolean): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, this.brushSize, this.brushSize);

    if (save) {
      this.pixelService.savePixel({ x, y, color }).subscribe();
    }
  }

  clearLocal(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
