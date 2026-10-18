import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { ServerService } from './server.service';
import { WebSocketService } from './websocket.service';

export interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl: string;
}

/** Quem está em cada canal de voz do servidor aberto, mesmo sem estar conectado a ele. */
@Injectable({ providedIn: 'root' })
export class VoicePresenceService {
  private readonly _byChannel = signal<Record<string, PresenceUser[]>>({});
  readonly byChannel = this._byChannel.asReadonly();

  private subscription?: Subscription;
  private serverId = '';

  constructor(
    private readonly http: HttpClient,
    private readonly serverService: ServerService,
    private readonly ws: WebSocketService
  ) {
    effect(() => {
      const serverId = this.serverService.activeServerId();
      this.watch(serverId || '');
    });
    this.ws.onReconnected$.subscribe(() => this.load());
  }

  usersIn(channelId: string): PresenceUser[] {
    return this._byChannel()[channelId] ?? [];
  }

  private watch(serverId: string): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.serverId = serverId;
    this._byChannel.set({});
    if (!serverId) return;

    this.load();
    this.subscription = this.ws
      .subscribe<{ channelId: string; users: PresenceUser[] }>(`/topic/servers/${serverId}/voice`)
      .subscribe((msg) => {
        this._byChannel.update((map) => ({ ...map, [msg.channelId]: msg.users ?? [] }));
      });
  }

  private load(): void {
    const serverId = this.serverId;
    if (!serverId) return;
    this.http
      .get<{ channelId: string; users: PresenceUser[] }[]>(`${environment.apiUrl}/voice/servers/${serverId}/state`)
      .subscribe({
        next: (list) => {
          if (serverId !== this.serverId) return;
          const map: Record<string, PresenceUser[]> = {};
          list.forEach((e) => (map[e.channelId] = e.users));
          this._byChannel.set(map);
        },
        error: (err) => console.warn('[VoicePresence] Falha ao carregar presença:', err),
      });
  }
}
