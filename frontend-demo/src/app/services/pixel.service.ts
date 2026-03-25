import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Pixel } from '../models/pixel.model';

@Injectable({
    providedIn: 'root'
})
export class PixelService {
    private readonly primaryRequestTimeoutMs = 12000;
    private readonly fallbackRequestTimeoutMs = 8000;
    private readonly apiUrl = '/api/pixels';
    private readonly roomsApiUrl = '/api/rooms';
    private readonly directApiBases = this.buildDirectApiBases();
    private readonly wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    private readonly baseWsUrl = `${this.wsProtocol}://${window.location.host}/ws-pixels`;
    private readonly directWsBases = this.buildDirectWsBases();
    private socket$: WebSocketSubject<Pixel> | null = null;

    constructor(private http: HttpClient) {}

    getPixels(roomId?: number): Observable<Pixel[]> {
        const url = roomId !== undefined ? `${this.apiUrl}?roomId=${roomId}` : this.apiUrl;
        const fallbackRequests = this.directApiBases.map(base => () => {
            const fallbackUrl = roomId !== undefined
                ? `${base}/pixels?roomId=${roomId}`
                : `${base}/pixels`;
            return this.http.get<Pixel[]>(fallbackUrl).pipe(timeout(this.fallbackRequestTimeoutMs));
        });

        return this.http.get<Pixel[]>(url).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.runSequential(fallbackRequests)
            ))
        );
    }

    getRoom(code: string): Observable<any> {
        const proxyUrl = `${this.roomsApiUrl}/${code}`;
        const fallbackRequests = this.directApiBases.map(base => () => {
            const fallbackUrl = `${base}/rooms/${code}`;
            return this.http.get<any>(fallbackUrl).pipe(timeout(this.fallbackRequestTimeoutMs));
        });

        return this.http.get<any>(proxyUrl).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.runSequential(fallbackRequests)
            ))
        );
    }

    createRoom(room: any): Observable<any> {
        const fallbackRequests = this.directApiBases.map(base => () => {
            const fallbackUrl = `${base}/rooms`;
            return this.http.post<any>(fallbackUrl, room).pipe(timeout(this.fallbackRequestTimeoutMs));
        });

        return this.http.post<any>(this.roomsApiUrl, room).pipe(
            timeout(this.primaryRequestTimeoutMs),
            catchError(error => this.tryHttpFallback(
                error,
                () => this.runSequential(fallbackRequests)
            ))
        );
    }

    connect(roomId?: number): Observable<Pixel> {
        if (this.socket$) {
            this.socket$.complete();
            this.socket$ = null;
        }

        const primaryUrl = roomId !== undefined ? `${this.baseWsUrl}?roomId=${roomId}` : this.baseWsUrl;

        const fallbackStreams = this.directWsBases.map(base => {
            const fallbackUrl = roomId !== undefined ? `${base}?roomId=${roomId}` : base;
            return () => {
                this.socket$ = webSocket(fallbackUrl);
                return this.socket$.asObservable();
            };
        });

        this.socket$ = webSocket(primaryUrl);

        return this.socket$.asObservable().pipe(
            catchError(error => {
                if (!this.shouldUseDirectFallback(error)) {
                    return throwError(() => error);
                }
                return this.runSequential(fallbackStreams);
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
        return error?.name === 'TimeoutError' || status === 0 || status === 404 || status === 502 || status === 503 || status === 504;
    }

    private runSequential<T>(requests: Array<() => Observable<T>>): Observable<T> {
        const [currentRequest, ...remaining] = requests;

        if (!currentRequest) {
            return throwError(() => new Error('No hay endpoints de fallback disponibles.'));
        }

        return currentRequest().pipe(
            catchError(error => {
                if (!this.shouldUseDirectFallback(error) || remaining.length === 0) {
                    return throwError(() => error);
                }
                return this.runSequential(remaining);
            })
        );
    }

    private buildDirectApiBases(): string[] {
        const protocol = window.location.protocol;
        const host = window.location.hostname;
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';

        const hostCandidates = isLocalHost
            ? [host, 'localhost', '127.0.0.1']
            : [host];

        const candidates = hostCandidates
            .filter(Boolean)
            .map(candidateHost => `${protocol}//${candidateHost}:8083/api`);

        return Array.from(new Set(candidates));
    }

    private buildDirectWsBases(): string[] {
        const host = window.location.hostname;
        const isLocalHost = host === 'localhost' || host === '127.0.0.1';

        const hostCandidates = isLocalHost
            ? [host, 'localhost', '127.0.0.1']
            : [host];

        const candidates = hostCandidates
            .filter(Boolean)
            .map(candidateHost => `${this.wsProtocol}://${candidateHost}:8083/ws-pixels`);

        return Array.from(new Set(candidates));
    }
}
