import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './chat-input.component.html',
})
export class ChatInputComponent {
  @Input({ required: true }) channelName!: string;
  @Output() send = new EventEmitter<string>();

  draft = '';

  submit(): void {
    if (!this.draft.trim()) return;
    this.send.emit(this.draft);
    this.draft = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }
}
