import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message.component.html',
})
export class MessageComponent {
  @Input({ required: true }) avatarUrl!: string;
  @Input({ required: true }) authorName!: string;
  @Input({ required: true }) createdAt!: Date;
  @Input({ required: true }) content!: string;
  /** Quando true, oculta avatar/nome para agrupar visualmente com a mensagem anterior */
  @Input() grouped = false;

  get formattedTime(): string {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
      this.createdAt
    );
  }
}
