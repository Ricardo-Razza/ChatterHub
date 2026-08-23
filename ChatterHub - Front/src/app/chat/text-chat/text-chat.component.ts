import { AfterViewChecked, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ChannelService } from '../../services/channel.service';
import { ChatService } from '../../services/chat.service';
import { MessageComponent } from '../message/message.component';
import { ChatInputComponent } from '../chat-input/chat-input.component';

@Component({
  selector: 'app-text-chat',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MessageComponent, ChatInputComponent],
  templateUrl: './text-chat.component.html',
})
export class TextChatComponent implements AfterViewChecked {
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLDivElement>;

  constructor(
    readonly channelService: ChannelService,
    readonly chatService: ChatService
  ) {}

  onSend(content: string): void {
    this.chatService.sendMessage(content);
  }

  ngAfterViewChecked(): void {
    this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}
