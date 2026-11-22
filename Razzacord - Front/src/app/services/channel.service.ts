import { Injectable, computed, signal, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { WebSocketService } from './websocket.service';
import { HttpClient } from '@angular/common/http';
import { Channel, ChannelType } from '../models/channel.model';
import { ServerService } from './server.service';
import { ChatService } from './chat.service';
import { environment } from '../../environments/environment';

export type ChannelDetails = Pick<Channel, 'name' | 'type' | 'topic' | 'category'>;

export type MainAreaMode = 'text' | 'voice' | 'dm';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly _channels = signal<Channel[]>([]);
  private readonly _activeChannelId = signal<string>('');
  private readonly _mainAreaMode = signal<MainAreaMode>('text');
  /** Canal de voz em que o usuário está conectado; independe do canal exibido na tela. */
  private readonly _voiceChannelId = signal<string>('');
  private readonly _voiceChannelName = signal<string>('');

  readonly channels = this._channels.asReadonly();
  readonly activeChannelId = this._activeChannelId.asReadonly();
  readonly mainAreaMode = this._mainAreaMode.asReadonly();
  readonly voiceChannelId = this._voiceChannelId.asReadonly();
  readonly voiceChannelName = this._voiceChannelName.asReadonly();

  private loadRevision = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly serverService: ServerService,
    private readonly chatService: ChatService,
    private readonly ws: WebSocketService
  ) {
    // Carrega canais sempre que o servidor ativo mudar
    effect((onCleanup) => {
      const serverId = this.serverService.activeServerId();
      if (serverId) {
        this.loadChannelsByServer(serverId);
        const subscription = this.ws.subscribe<{ type: string }>(`/topic/servers/${serverId}/events`).subscribe((event) => {
          if (event.type === 'channels-updated') this.loadChannelsByServer(serverId);
          if (event.type === 'server-updated') this.serverService.loadServers();
        });
        onCleanup(() => subscription.unsubscribe());
      } else {
        this._channels.set([]);
        this._activeChannelId.set('');
      }
    }, { allowSignalWrites: true });

    // Inicializa chat quando canal de texto muda
    effect(() => {
      const channelId = this._activeChannelId();
      const mode = this._mainAreaMode();
      if (channelId && mode === 'text') {
        this.chatService.initChannel(channelId);
      } else if (!channelId || mode !== 'text') {
        this.chatService.resetChannel();
      }
    }, { allowSignalWrites: true });
  }

  loadChannelsByServer(serverId: string): void {
    const revision = ++this.loadRevision;
    this.http
      .get<Channel[]>(`${environment.apiUrl}/servers/${serverId}/channels`)
      .subscribe({
        next: (channels) => {
          if (revision !== this.loadRevision || serverId !== this.serverService.activeServerId()) return;
          const wasHere = this._channels().some((channel) => channel.id === this._voiceChannelId() && channel.serverId === serverId);
          this._channels.set(channels);
          const voice = channels.find((channel) => channel.id === this._voiceChannelId());
          if (voice) this._voiceChannelName.set(voice.name);
          else if (wasHere) this.leaveVoiceChannel();
          if (!channels.some((channel) => channel.id === this._activeChannelId())) {
            this.selectTextChannel(channels.find((channel) => channel.type !== 'voice')?.id ?? '');
          }
        },
        error: (err) => console.error('[ChannelService] Falha ao carregar canais:', err),
      });
  }

  async saveChannel(serverId: string, details: ChannelDetails, id?: string): Promise<void> {
    const url = `${environment.apiUrl}/channels`;
    const response = id
      ? this.http.put<Channel>(`${url}/${id}`, details)
      : this.http.post<Channel>(url, { ...details, serverId });
    const channel = await firstValueFrom(response);
    if (serverId !== this.serverService.activeServerId()) return;
    this.loadChannelsByServer(serverId);
    if (!id && channel.type !== 'voice') this.selectTextChannel(channel.id);
  }

  async deleteChannel(channel: Channel): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/channels/${channel.id}`));
    if (channel.serverId === this.serverService.activeServerId()) {
      this.loadChannelsByServer(channel.serverId);
      this.serverService.loadServers();
    }
  }

  async reorderChannels(serverId: string, ids: string[]): Promise<void> {
    await firstValueFrom(this.http.put<Channel[]>(`${environment.apiUrl}/servers/${serverId}/channels/order`, ids));
    if (serverId === this.serverService.activeServerId()) this.loadChannelsByServer(serverId);
  }

  readonly channelsForActiveServer = computed<Channel[]>(() => {
    const serverId = this.serverService.activeServerId();
    return this._channels().filter((c) => c.serverId === serverId);
  });

  readonly textChannels = computed<Channel[]>(() =>
    this.channelsForActiveServer().filter((c) => c.type !== 'voice')
  );

  readonly voiceChannels = computed<Channel[]>(() =>
    this.channelsForActiveServer().filter((c) => c.type === 'voice')
  );

  readonly activeChannel = computed<Channel | undefined>(() =>
    this._channels().find((c) => c.id === this._activeChannelId())
  );

  selectTextChannel(channelId: string): void {
    this._activeChannelId.set(channelId);
    this._mainAreaMode.set('text');
  }

  joinVoiceChannel(channelId: string): void {
    this._voiceChannelId.set(channelId);
    this._voiceChannelName.set(this._channels().find((c) => c.id === channelId)?.name ?? '');
    this._activeChannelId.set(channelId);
    this._mainAreaMode.set('voice');
  }

  /** Volta a exibir a sala de voz atual (sem reconectar). */
  showVoiceRoom(): void {
    const id = this._voiceChannelId();
    if (!id) return;
    this._activeChannelId.set(id);
    this._mainAreaMode.set('voice');
  }

  /** Desconecta da chamada. */
  leaveVoiceChannel(): void {
    this._voiceChannelId.set('');
    this._voiceChannelName.set('');
    if (this._mainAreaMode() === 'voice') {
      const firstText = this.textChannels()[0];
      if (firstText) {
        this.selectTextChannel(firstText.id);
      } else {
        this.selectTextChannel('');
      }
    }
  }
}
