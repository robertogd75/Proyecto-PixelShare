import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Pixel } from '../models/pixel.model';

@Injectable({
    providedIn: 'root'
})
export class PixelService {
    private readonly apiUrl = '/api/pixels';

    constructor(private http: HttpClient) {}

    getPixels(): Observable<Pixel[]> {
        return this.http.get<Pixel[]>(this.apiUrl);
    }

    savePixel(pixel: Pixel): Observable<Pixel> {
        return this.http.post<Pixel>(this.apiUrl, pixel);
    }
}
