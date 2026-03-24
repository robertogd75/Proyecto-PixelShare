import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly storageKey = 'pixelshare_theme';
  private readonly themeSubject = new BehaviorSubject<ThemeMode>('light');
  public readonly theme$ = this.themeSubject.asObservable();

  constructor() {
    const savedTheme = this.getSavedTheme();
    this.applyTheme(savedTheme);
  }

  get currentTheme(): ThemeMode {
    return this.themeSubject.value;
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(nextTheme);
  }

  setTheme(theme: ThemeMode): void {
    this.applyTheme(theme);
  }

  private applyTheme(theme: ThemeMode): void {
    this.themeSubject.next(theme);
    localStorage.setItem(this.storageKey, theme);

    const body = document.body;
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('theme-light', theme === 'light');
  }

  private getSavedTheme(): ThemeMode {
    const value = localStorage.getItem(this.storageKey);
    return value === 'dark' ? 'dark' : 'light';
  }
}
