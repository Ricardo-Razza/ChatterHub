import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './user-card.component.html',
  host: {
    class: 'flex items-center justify-center w-full h-full min-h-0 min-w-0',
  },
})
export class UserCardComponent {
  @Input({ required: true }) user!: User;
  /** Card em destaque (usado no layout de compartilhamento de tela) */
  @Input() featured = false;
}
