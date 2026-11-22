import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DmService } from '../../services/dm.service';
import { AuthService } from '../../services/auth.service';
import { DmConversation } from '../../models/direct-message.model';

@Component({
  selector: 'app-dm-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './dm-panel.component.html',
})
export class DmPanelComponent {
  draft = '';

  constructor(
    readonly dmService: DmService,
    readonly authService: AuthService
  ) {}

  selectConversation(userId: string): void {
    this.dmService.openDm(userId);
  }

  sendMessage(): void {
    const receiverId = this.dmService.activeDmUserId();
    if (!receiverId || !this.draft.trim()) return;
    this.dmService.sendDm(receiverId, this.draft);
    this.draft = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  get activeConversation(): DmConversation | undefined {
    return this.dmService.conversations().find(
      (c) => c.userId === this.dmService.activeDmUserId()
    );
  }

  isOwn(senderId: string): boolean {
    return senderId === this.authService.currentUser().id;
  }
}
