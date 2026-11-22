import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  readonly toasts = signal<Toast[]>([]);

  private add(type: ToastType, message: string, duration = 4000): void {
    const id = ++this.counter;
    this.toasts.update((list) => [...list, { id, type, message }]);
    setTimeout(() => this.remove(id), duration);
  }

  remove(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  success(message: string): void { this.add('success', message); }
  error(message: string): void   { this.add('error', message, 6000); }
  info(message: string): void    { this.add('info', message); }
  warning(message: string): void { this.add('warning', message); }
}
