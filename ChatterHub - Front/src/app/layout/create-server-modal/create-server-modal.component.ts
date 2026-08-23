import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServerService } from '../../services/server.service';

@Component({
  selector: 'app-create-server-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-server-modal.component.html',
})
export class CreateServerModalComponent {
  readonly visible = signal(false);
  name = '';

  constructor(private readonly serverService: ServerService) {}

  open(): void {
    this.name = '';
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }

  onBackdropClick(event: MouseEvent): void {
    this.close();
  }

  submit(): void {
    if (!this.name.trim()) return;
    this.serverService.createServer(this.name.trim());
    this.close();
  }
}