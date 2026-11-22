import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl text-sm font-medium border animate-fadeIn max-w-sm"
          [ngClass]="{
            'bg-ch-success/90 border-green-500/30 text-white': toast.type === 'success',
            'bg-ch-danger/90 border-red-500/30 text-white': toast.type === 'error',
            'bg-ch-brand/90 border-blue-500/30 text-white': toast.type === 'info',
            'bg-yellow-500/90 border-yellow-400/30 text-white': toast.type === 'warning'
          }"
        >
          <lucide-icon
            [name]="toast.type === 'success' ? 'check-circle' : toast.type === 'error' ? 'alert-circle' : toast.type === 'warning' ? 'alert-triangle' : 'info'"
            [size]="18"
            class="shrink-0"
          />
          <span class="flex-1">{{ toast.message }}</span>
          <button
            type="button"
            (click)="toastService.remove(toast.id)"
            class="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <lucide-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  constructor(readonly toastService: ToastService) {}
}
