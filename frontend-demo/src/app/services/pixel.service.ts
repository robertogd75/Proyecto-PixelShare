import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Pixel } from '../models/pixel.model';

@Injectable({
    providedIn: 'root'
})
export class PixelService {
    private readonly primaryRequestTimeoutMs = 3500;
    private readonly fallbackRequestTimeoutMs = 6000;
    private readonly apiUrl = '/api/pixels';
    private readonly roomsApiUrl = '/api/rooms';
    private readonly directApiBase = `${window.location.protocol}//${window.location.hostname}:8083/api`;
    private readonly wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    private readonly baseWsUrl = `${this.wsProtocol}://${window.location.host}/ws-pixels`;
    private readonly directWsBaseUrl = `${this.wsProtocol}://${window.location.hostname}:8083/ws-pixels`;
    private socket$: WebSocketSubject<Pixel> | null = null;

    constructor(private http: HttpClient) {}

    getPixels(roomId?: number): Observable<Pixel[]> {
        const url = roomId !== undefined ? `${this.apiUrl}?roomId=${roomId}` : this.apiUrl;
        const fallbackUrl = roomId !== undefined
            ? `${this.directApiBase}/pixels?roomId=${roomId}`
            : `${this.directApiBase}/pixels`;

        return this.http.get<Pixel[]>(url).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.http.get<Pixel[]>(fallbackUrl).pipe(timeout(this.fallbackRequestTimeoutMs))
            ))
        );
    }

    getRoom(code: string): Observable<any> {
        const proxyUrl = `${this.roomsApiUrl}/${code}`;
        const fallbackUrl = `${this.directApiBase}/rooms/${code}`;

        return this.http.get<any>(proxyUrl).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.http.get<any>(fallbackUrl).pipe(timeout(this.fallbackRequestTimeoutMs))
            ))
        );
    }

    createRoom(room: any): Observable<any> {
        const fallbackUrl = `${this.directApiBase}/rooms`;

        return this.http.post<any>(this.roomsApiUrl, room).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.http.post<any>(fallbackUrl, room).pipe(timeout(this.fallbackRequestTimeoutMs))
            ))
        );
    }

    connect(roomId?: number): Observable<Pixel> {
        if (this.socket$) {
            this.socket$.complete();
            this.socket$ = null;
        }

        const primaryUrl = roomId !== undefined ? `${this.baseWsUrl}?roomId=${roomId}` : this.baseWsUrl;
        const fallbackUrl = roomId !== undefined ? `${this.directWsBaseUrl}?roomId=${roomId}` : this.directWsBaseUrl;

        this.socket$ = webSocket(primaryUrl);

        return this.socket$.asObservable().pipe(
            catchError(error => {
                if (!this.shouldUseDirectFallback(error)) {
                    return throwError(() => error);
                }

                this.socket$ = webSocket(fallbackUrl);
                return this.socket$.asObservable();
            })
        );
    }

    sendPixel(pixel: Pixel): void {
        this.socket$?.next(pixel);
    }

    private tryHttpFallback<T>(error: any, fallbackRequest: () => Observable<T>): Observable<T> {
        if (this.shouldUseDirectFallback(error)) {
            return fallbackRequest();
        }
        return throwError(() => error);
    }

    private shouldUseDirectFallback(error: any): boolean {
        const status = error?.status;
        return error?.name === 'TimeoutError' || status === 0 || status === 502 || status === 503 || status === 504;
    }
}
