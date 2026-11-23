import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from './services/auth.service';
import { DmService } from './services/dm.service';
import { ServerSidebarComponent } from './layout/server-sidebar/server-sidebar.component';
import { ChannelSidebarComponent } from './layout/channel-sidebar/channel-sidebar.component';
import { RouterOutlet } from '@angular/router';
import { LoginComponent } from './layout/login/login.component';
import { ToastContainerComponent } from './shared/toast-container/toast-container.component';
import { DmPanelComponent } from './chat/dm-panel/dm-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ServerSidebarComponent,
    ChannelSidebarComponent,
    RouterOutlet,
    LoginComponent,
    ToastContainerComponent,
    DmPanelComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  showDmPanel = false;
  readonly isDesktop = typeof window !== 'undefined'
    && !!(window as any).electronAPI?.isDesktop;

  readonly dmUnread = computed(() => this.dmService.totalUnread());

  constructor(
    readonly authService: AuthService,
    readonly dmService: DmService
  ) {}

  toggleDmPanel(): void {
    this.showDmPanel = !this.showDmPanel;
  }

  minimizeWindow(): void {
    (window as any).electronAPI?.minimize();
  }

  maximizeWindow(): void {
    (window as any).electronAPI?.maximize();
  }

  closeWindow(): void {
    (window as any).electronAPI?.close();
  }
}