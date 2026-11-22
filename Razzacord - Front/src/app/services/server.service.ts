import { Injectable, computed, signal, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Server } from '../models/server.model';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface InvitePreview {
  serverName: string;
  iconUrl?: string;
  bannerUrl?: string;
  description?: string;
  initials: string;
  memberCount: number;
}

export interface ServerInvite {
  code: string;
  expiresAt: string;
  uses: number;
}

@Injectable({ providedIn: 'root' })
export class ServerService {
  private readonly _servers = signal<Server[]>([]);
  private readonly _activeServerId = signal<string>('');

  readonly servers = this._servers.asReadonly();
  readonly activeServerId = this._activeServerId.asReadonly();

  readonly activeServer = computed<Server | undefined>(() =>
    this._servers().find((s) => s.id === this._activeServerId())
  );

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {
    effect(() => {
      if (this.authService.isLoggedIn()) {
        this.loadServers();
      } else {
        this._servers.set([]);
        this._activeServerId.set('');
      }
    }, { allowSignalWrites: true });
  }

  loadServers(): void {
    this.http.get<Server[]>(`${environment.apiUrl}/servers`).subscribe({
      next: (mapped) => {

        this._servers.set(mapped);
        if (mapped.length > 0) {
          if (!this._activeServerId() || !mapped.some(s => s.id === this._activeServerId())) {
            this._activeServerId.set(mapped[0].id);
          }
        } else {
          this._activeServerId.set('');
        }
      },
      error: (err) => console.error('[ServerService] Falha ao carregar servidores:', err),
    });
  }

  async updateServer(id: string, details: Omit<Server, 'id'>): Promise<void> {
    const server = await firstValueFrom(this.http.put<Server>(`${environment.apiUrl}/servers/${id}`, details));
    this._servers.update((list) => list.map((item) => item.id === id ? server : item));
  }

  listInvites(id: string): Promise<ServerInvite[]> {
    return firstValueFrom(this.http.get<ServerInvite[]>(`${environment.apiUrl}/servers/${id}/invites`));
  }

  revokeInvite(code: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/invites/${encodeURIComponent(code)}`));
  }

  setActiveServer(serverId: string): void {
    this._activeServerId.set(serverId);
  }

  createServer(name: string, iconUrl?: string): Promise<Server> {
    return new Promise((resolve, reject) => {
      this.http
        .post<any>(`${environment.apiUrl}/servers`, { name, iconUrl })
        .subscribe({
          next: (created) => {
            const newServer: Server = {
              id: created.id,
              name: created.name,
              iconUrl: created.iconUrl,
              initials: created.initials,
            };
            this._servers.update((list) => [...list, newServer]);
            this.setActiveServer(newServer.id);
            resolve(newServer);
          },
          error: (err) =>
            reject(err?.error?.message || err?.message || 'Erro ao criar servidor'),
        });
    });
  }

  createInvite(serverId: string): Promise<{ code: string; expiresAt: string }> {
    return new Promise((resolve, reject) => {
      this.http
        .post<{ code: string; expiresAt: string }>(`${environment.apiUrl}/servers/${serverId}/invites`, {})
        .subscribe({
          next: (r) => resolve(r),
          error: (err) => reject(err?.error?.message || err?.message || 'Erro ao criar convite'),
        });
    });
  }

  previewInvite(code: string): Promise<InvitePreview> {
    return new Promise((resolve, reject) => {
      this.http.get<InvitePreview>(`${environment.apiUrl}/invites/${encodeURIComponent(code)}`).subscribe({
        next: (r) => resolve(r),
        error: (err) => reject(err?.error?.message || err?.message || 'Convite inválido'),
      });
    });
  }

  acceptInvite(code: string): Promise<Server> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/invites/${encodeURIComponent(code)}/accept`, {}).subscribe({
        next: (s) => {
          const server: Server = {
            id: s.id,
            name: s.name,
            iconUrl: s.iconUrl,
            initials: s.initials,
            hasNotification: s.hasNotification ?? false,
          };
          this.loadServers();
          this.setActiveServer(server.id);
          resolve(server);
        },
        error: (err) => reject(err?.error?.message || err?.message || 'Erro ao entrar no servidor'),
      });
    });
  }

  inviteUrl(code: string): string {
    return `${window.location.origin}/convite/${code}`;
  }

  kickMember(serverId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.delete<void>(`${environment.apiUrl}/servers/${serverId}/members/${userId}`).subscribe({
        next: () => resolve(),
        error: (err) => reject(err?.error?.message || err?.message || 'Erro ao expulsar membro'),
      });
    });
  }

  leaveServer(serverId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/servers/${serverId}/leave`, {}).subscribe({
        next: () => {
          this._servers.update((list) => list.filter((s) => s.id !== serverId));
          if (this._activeServerId() === serverId) {
            const remaining = this._servers();
            this._activeServerId.set(remaining.length > 0 ? remaining[0].id : '');
          }
          resolve();
        },
        error: (err) => reject(err?.error?.message || err?.message || 'Erro ao sair do servidor'),
      });
    });
  }
}
