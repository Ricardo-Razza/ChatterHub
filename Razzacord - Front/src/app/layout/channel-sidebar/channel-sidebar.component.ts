import { Component, computed, signal, ViewChild } from '@angular/core';
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
import { InviteModalComponent } from '../invite-modal/invite-modal.component';
import { ServerSettingsModalComponent } from '../server-settings-modal/server-settings-modal.component';
import { PermissionService } from '../../services/permission.service';
import { Channel } from '../../models/channel.model';
import { ToastService } from '../../services/toast.service';
import { PERM } from '../../models/role.model';

@Component({
  selector: 'app-channel-sidebar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, UserControlsComponent, CreateChannelModalComponent, InviteModalComponent, ServerSettingsModalComponent],
  templateUrl: './channel-sidebar.component.html',
  host: { class: 'block h-full' },
})
export class ChannelSidebarComponent {
  readonly textGroups = computed(() => this.groupChannels(this.channelService.textChannels()));
  readonly voiceGroups = computed(() => this.groupChannels(this.channelService.voiceChannels()));
  readonly menuChannel = signal<string | null>(null);
  readonly deleting = signal<Channel | null>(null);
  readonly removing = signal(false);
  readonly dropTarget = signal<string | null>(null);
  private dragged?: Channel;
  @ViewChild(CreateChannelModalComponent) createChannelModal!: CreateChannelModalComponent;
  @ViewChild(InviteModalComponent) inviteModal!: InviteModalComponent;
  @ViewChild(ServerSettingsModalComponent) settingsModal!: ServerSettingsModalComponent;

  readonly PERM = PERM;
  readonly textCollapsed = signal(false);
  readonly voiceCollapsed = signal(false);

  constructor(
    readonly serverService: ServerService,
    readonly channelService: ChannelService,
    readonly authService: AuthService,
    readonly userService: UserService,
    readonly voiceService: VoiceService,
    readonly chatService: ChatService,
    readonly presence: VoicePresenceService,
    readonly perm: PermissionService,
    private readonly toast: ToastService
  ) {}

  canOpenSettings(): boolean {
    return this.perm.can(PERM.MANAGE_SERVER) || this.perm.can(PERM.MANAGE_ROLES) || this.perm.can(PERM.KICK_MEMBERS);
  }

  openSettings(): void {
    this.settingsModal.open();
  }

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

  openInvite(): void {
    const serverId = this.serverService.activeServerId();
    if (serverId) this.inviteModal.open(serverId);
  }

  private groupChannels(channels: Channel[]): { category: string; channels: Channel[] }[] {
    const groups = new Map<string, Channel[]>();
    for (const channel of channels) {
      const category = channel.category ?? '';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(channel);
    }
    return [...groups].map(([category, channels]) => ({ category, channels }));
  }

  toggleChannelMenu(event: Event, channel: Channel): void {
    if (!this.perm.can(PERM.MANAGE_CHANNELS)) return;
    event.preventDefault();
    this.menuChannel.update(id => id === channel.id ? null : channel.id);
  }

  editChannel(channel: Channel): void {
    this.menuChannel.set(null);
    this.createChannelModal.open(channel.type, channel);
  }

  askToDelete(channel: Channel): void {
    this.menuChannel.set(null);
    this.deleting.set(channel);
  }

  async deleteChannel(): Promise<void> {
    const channel = this.deleting();
    if (!channel || this.removing()) return;
    this.removing.set(true);
    try {
      await this.channelService.deleteChannel(channel);
      this.deleting.set(null);
    } catch (error: any) {
      this.toast.error(error?.error?.message || 'Erro ao apagar canal');
    } finally {
      this.removing.set(false);
    }
  }

  startDrag(event: DragEvent, channel: Channel): void {
    if (!this.perm.can(PERM.MANAGE_CHANNELS)) return;
    this.dragged = channel;
    event.dataTransfer?.setData('text/plain', channel.id);
  }

  dragOver(event: DragEvent, channel: Channel): void {
    if (!this.dragged || !this.canReorderWith(this.dragged, channel)) {
      this.dropTarget.set(null);
      return;
    }
    event.preventDefault();
    this.dropTarget.set(channel.id);
  }

  endDrag(): void {
    this.dragged = undefined;
    this.dropTarget.set(null);
  }

  async dropChannel(event: DragEvent, target: Channel): Promise<void> {
    event.preventDefault();
    const channel = this.dragged;
    this.endDrag();
    if (!channel || channel.id === target.id) return;
    await this.moveChannel(channel, target);
  }

  nearbyChannel(channel: Channel, offset: number): Channel | undefined {
    const channels = channel.type === 'voice' ? this.channelService.voiceChannels() : this.channelService.textChannels();
    const group = channels.filter(item => (item.category ?? '') === (channel.category ?? ''));
    return group[group.findIndex(item => item.id === channel.id) + offset];
  }

  private canReorderWith(channel: Channel, target: Channel): boolean {
    return channel.id !== target.id && channel.serverId === target.serverId
      && (channel.type === 'voice') === (target.type === 'voice')
      && (channel.category ?? '') === (target.category ?? '');
  }

  async moveChannel(channel: Channel, target?: Channel): Promise<void> {
    if (!target || !this.canReorderWith(channel, target) || !this.perm.can(PERM.MANAGE_CHANNELS)) return;
    const ids = this.channelService.channelsForActiveServer().map(item => item.id);
    const from = ids.indexOf(channel.id);
    const to = ids.indexOf(target.id);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, channel.id);
    this.menuChannel.set(null);
    try {
      await this.channelService.reorderChannels(channel.serverId, ids);
    } catch (error: any) {
      this.toast.error(error?.error?.message || 'Erro ao reordenar canais');
    }
  }

  connectedUsers(ids: string[] | undefined) {
    return this.userService.getUsersByIds(ids ?? []);
  }

  isUnread(channelId: string): boolean {
    return this.chatService.unreadChannels().has(channelId);
  }
}