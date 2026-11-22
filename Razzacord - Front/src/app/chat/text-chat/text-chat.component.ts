import {
  AfterViewChecked,
  Component,
  effect,
  ElementRef,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PermissionService } from '../../services/permission.service';
import { PERM } from '../../models/role.model';
import { ChannelService } from '../../services/channel.service';
import { ChatService } from '../../services/chat.service';
import { MessageComponent } from '../message/message.component';
import { ChatInputComponent } from '../chat-input/chat-input.component';

@Component({
  selector: 'app-text-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, MessageComponent, ChatInputComponent],
  templateUrl: './text-chat.component.html',
})
export class TextChatComponent implements AfterViewChecked {
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;

  private shouldScrollToBottom = true;
  private lastMessageCount = 0;

  editingMessage = signal<{ id: string; content: string } | null>(null);

  constructor(
    readonly channelService: ChannelService,
    readonly chatService: ChatService,
    private readonly perm: PermissionService
  ) {
    effect(() => {
      this.channelService.activeChannelId();
      this.editingMessage.set(null);
    }, { allowSignalWrites: true });
  }

  get canPost(): boolean {
    return this.channelService.activeChannel()?.type !== 'announcement' || this.perm.can(PERM.MANAGE_MESSAGES);
  }

  onSend(payload: { content: string; attachment?: { url: string; type: 'image' | 'file'; name: string } }): void {
    if (!this.canPost) return;
    if (this.editingMessage()) {
      this.chatService.editMessage(this.editingMessage()!.id, payload.content);
      this.editingMessage.set(null);
    } else {
      this.chatService.sendMessage(payload.content, undefined, payload.attachment);
    }
    this.shouldScrollToBottom = true;
  }

  onEditRequested(data: { id: string; content: string }): void {
    if (this.canPost) this.editingMessage.set(data);
  }

  cancelEdit(): void {
    this.editingMessage.set(null);
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.shouldScrollToBottom = distanceFromBottom < 150;

    // Scroll infinito — carregar mais quando chegar ao topo
    if (el.scrollTop < 80 && this.chatService.hasMore() && !this.chatService.isLoading()) {
      const channelId = this.channelService.activeChannelId();
      if (channelId) {
        this.chatService.loadMore(channelId);
      }
    }
  }

  ngAfterViewChecked(): void {
    const messages = this.chatService.messagesForActiveChannel();
    const currentCount = messages.length;

    // Só rola para baixo quando uma nova mensagem chega (não quando carrega mais antigas)
    if (currentCount > this.lastMessageCount && this.shouldScrollToBottom) {
      this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    this.lastMessageCount = currentCount;
  }
}
