import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Pixel } from '../models/pixel.model';

@Injectable({
    providedIn: 'root'
})
export class PixelService {
    private readonly apiUrl = '/api/pixels';
    private readonly baseWsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws-pixels`;
    private socket$: WebSocketSubject<Pixel> | null = null;

    constructor(private http: HttpClient) {}

    getPixels(roomId?: number): Observable<Pixel[]> {
        const url = roomId !== undefined ? `${this.apiUrl}?roomId=${roomId}` : this.apiUrl;
        return this.http.get<Pixel[]>(url);
    }

    getRoom(code: string): Observable<any> {
        return this.http.get<any>(`/api/rooms/${code}`);
    }

    createRoom(room: any): Observable<any> {
        return this.http.post<any>('/api/rooms', room);
    }

    connect(roomId?: number): Observable<Pixel> {
        if (this.socket$) {
            this.socket$.complete();
            this.socket$ = null;
        }
        const wsUrl = roomId !== undefined ? `${this.baseWsUrl}?roomId=${roomId}` : this.baseWsUrl;
        this.socket$ = webSocket(wsUrl);
        return this.socket$.asObservable();
    }

    sendPixel(pixel: Pixel): void {
        this.socket$?.next(pixel);
    }
}
