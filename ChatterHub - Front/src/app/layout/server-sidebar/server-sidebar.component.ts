import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ServerIconComponent } from '../server-icon/server-icon.component';
import { ServerService } from '../../services/server.service';
import { AuthService } from '../../services/auth.service';
import { CreateServerModalComponent } from '../create-server-modal/create-server-modal.component';

@Component({
  selector: 'app-server-sidebar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ServerIconComponent, CreateServerModalComponent],
  templateUrl: './server-sidebar.component.html',
  host: { class: 'block h-full' },
})
export class ServerSidebarComponent {
  @ViewChild(CreateServerModalComponent) createServerModal!: CreateServerModalComponent;
  @Input() dmUnread = 0;
  @Output() openDm = new EventEmitter<void>();

  constructor(
    readonly serverService: ServerService,
    readonly authService: AuthService
  ) {}

  canCreateServer(): boolean {
    return true;
  }

  selectServer(serverId: string): void {
    this.serverService.setActiveServer(serverId);
  }

  addServer(): void {
    this.createServerModal.open();
  }

  onOpenDm(): void {
    this.openDm.emit();
  }
}