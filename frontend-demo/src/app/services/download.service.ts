import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DownloadService {
  private downloadRequestSource = new Subject<void>();
  downloadRequest$ = this.downloadRequestSource.asObservable();

  requestDownload() {
    this.downloadRequestSource.next();
  }
}
