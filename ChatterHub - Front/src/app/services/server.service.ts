import { Injectable, computed, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Server } from '../models/server.model';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

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
    this.http.get<any[]>(`${environment.apiUrl}/servers`).subscribe({
      next: (data) => {
        const mapped: Server[] = data.map((s) => ({
          id: s.id,
          name: s.name,
          iconUrl: s.iconUrl,
          initials: s.initials,
          hasNotification: s.hasNotification ?? false,
        }));

        this._servers.set(mapped);
        if (mapped.length > 0) {
          if (!this._activeServerId() || !mapped.some(s => s.id === this._activeServerId())) {
            this._activeServerId.set(mapped[0].id);
          }
        } else {
          // Se o usuário não tem servidores ainda, cria automaticamente o primeiro servidor
          const uname = this.authService.currentUser().username || 'Geral';
          this.createServer(`Servidor de ${uname}`);
        }
      },
      error: (err) => console.error('[ServerService] Falha ao carregar servidores:', err),
    });
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

  joinServer(serverId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/servers/${serverId}/join`, {}).subscribe({
        next: () => {
          this.loadServers();
          resolve();
        },
        error: (err) => reject(err?.error?.message || err?.message || 'Erro ao entrar no servidor'),
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
