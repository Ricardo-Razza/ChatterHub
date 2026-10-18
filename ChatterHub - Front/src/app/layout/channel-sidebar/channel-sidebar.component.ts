import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ServerService } from '../../services/server.service';
import { ChannelService } from '../../services/channel.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { VoiceService } from '../../services/voice.service';
import { ChatService } from '../../services/chat.service';
import { VoicePresenceService } from '../../services/voice-presence.service';
import { UserControlsComponent } from '../user-controls/user-controls.component';
import { CreateChannelModalComponent } from '../create-channel-modal/create-channel-modal.component';

@Component({
  selector: 'app-channel-sidebar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, UserControlsComponent, CreateChannelModalComponent],
  templateUrl: './channel-sidebar.component.html',
  host: { class: 'block h-full' },
})
export class ChannelSidebarComponent {
  @ViewChild(CreateChannelModalComponent) createChannelModal!: CreateChannelModalComponent;

  readonly textCollapsed = signal(false);
  readonly voiceCollapsed = signal(false);

  constructor(
    readonly serverService: ServerService,
    readonly channelService: ChannelService,
    readonly authService: AuthService,
    readonly userService: UserService,
    readonly voiceService: VoiceService,
    readonly chatService: ChatService,
    readonly presence: VoicePresenceService
  ) {}

  toggleText(): void { this.textCollapsed.update((v) => !v); }
  toggleVoice(): void { this.voiceCollapsed.update((v) => !v); }

  selectText(channelId: string): void {
    this.channelService.selectTextChannel(channelId);
    this.chatService.markAsRead(channelId);
  }

  joinVoice(channelId: string): void {
    if (this.channelService.voiceChannelId() === channelId) {
      this.channelService.showVoiceRoom();
    } else {
      this.channelService.joinVoiceChannel(channelId);
    }
  }

  addTextChannel(): void { this.createChannelModal.open('text'); }
  addVoiceChannel(): void { this.createChannelModal.open('voice'); }

  connectedUsers(ids: string[] | undefined) {
    return this.userService.getUsersByIds(ids ?? []);
  }

  isUnread(channelId: string): boolean {
    return this.chatService.unreadChannels().has(channelId);
  }
}