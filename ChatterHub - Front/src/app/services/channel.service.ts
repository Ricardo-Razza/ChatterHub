import { Injectable, computed, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Channel, ChannelType } from '../models/channel.model';
import { ServerService } from './server.service';
import { environment } from '../../environments/environment';

export type MainAreaMode = 'text' | 'voice';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly _channels = signal<Channel[]>([]);
  private readonly _activeChannelId = signal<string>('');
  private readonly _mainAreaMode = signal<MainAreaMode>('text');

  readonly channels = this._channels.asReadonly();
  readonly activeChannelId = this._activeChannelId.asReadonly();
  readonly mainAreaMode = this._mainAreaMode.asReadonly();

  constructor(
    private readonly http: HttpClient,
    private readonly serverService: ServerService
  ) {
    // Carrega canais sempre que o servidor ativo mudar
    effect(() => {
      const serverId = this.serverService.activeServerId();
      if (serverId) {
        this.loadChannelsByServer(serverId);
      } else {
        this._channels.set([]);
        this._activeChannelId.set('');
      }
    }, { allowSignalWrites: true });
  }

  loadChannelsByServer(serverId: string): void {
    this.http
      .get<any[]>(`${environment.apiUrl}/servers/${serverId}/channels`)
      .subscribe({
        next: (data) => {
          const mapped: Channel[] = data.map((c) => ({
            id: c.id,
            serverId: c.serverId,
            name: c.name,
            type: (c.type ? c.type.toLowerCase() : 'text') as ChannelType,
            connectedUserIds: c.connectedUserIds ?? [],
            unread: c.unread ?? false,
          }));

          this._channels.set(mapped);
          // Se o canal ativo não existir na lista do novo servidor, seleciona o primeiro de texto
          const exists = mapped.some((c) => c.id === this._activeChannelId());
          if (!exists) {
            const firstText = mapped.find((c) => c.type === 'text');
            if (firstText) {
              this.selectTextChannel(firstText.id);
            } else if (mapped.length > 0) {
              this._activeChannelId.set(mapped[0].id);
            } else {
              this._activeChannelId.set('');
            }
          }
        },
        error: (err) => console.error('[ChannelService] Falha ao carregar canais:', err),
      });
  }

  createChannel(name: string, type: ChannelType): void {
    const serverId = this.serverService.activeServerId();
    if (!serverId) return;

    this.http
      .post<any>(`${environment.apiUrl}/channels`, {
        name,
        type: type.toUpperCase(),
        serverId,
      })
      .subscribe({
        next: (created) => {
          const newChan: Channel = {
            id: created.id,
            serverId: created.serverId,
            name: created.name,
            type: (created.type ? created.type.toLowerCase() : 'text') as ChannelType,
            connectedUserIds: created.connectedUserIds ?? [],
          };
          this._channels.update((list) => [...list, newChan]);
          if (newChan.type === 'text') {
            this.selectTextChannel(newChan.id);
          }
        },
        error: (err) => console.error('[ChannelService] Falha ao criar canal:', err),
      });
  }

  readonly channelsForActiveServer = computed<Channel[]>(() => {
    const serverId = this.serverService.activeServerId();
    return this._channels().filter((c) => c.serverId === serverId);
  });

  readonly textChannels = computed<Channel[]>(() =>
    this.channelsForActiveServer().filter((c) => c.type === 'text')
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
    this._activeChannelId.set(channelId);
    this._mainAreaMode.set('voice');
  }

  leaveVoiceChannel(): void {
    this._mainAreaMode.set('text');
  }
}
