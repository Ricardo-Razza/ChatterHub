import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Server } from '../../models/server.model';

@Component({
  selector: 'app-server-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './server-icon.component.html',
})
export class ServerIconComponent {
  @Input({ required: true }) server!: Server;
  @Input() active = false;
  @Output() selected = new EventEmitter<string>();

  onClick(): void {
    this.selected.emit(this.server.id);
  }
}
