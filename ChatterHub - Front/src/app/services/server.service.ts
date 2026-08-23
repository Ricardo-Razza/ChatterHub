import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Server } from '../models/server.model';
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

  constructor(private readonly http: HttpClient) {
    this.loadServers();
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
        if (mapped.length > 0 && !this._activeServerId()) {
          this._activeServerId.set(mapped[0].id);
        }
      },
      error: (err) => console.error('[ServerService] Falha ao carregar servidores:', err),
    });
  }

  setActiveServer(serverId: string): void {
    this._activeServerId.set(serverId);
  }

  createServer(name: string, iconUrl?: string): void {
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
        },
        error: (err) => console.error('[ServerService] Falha ao criar servidor:', err),
      });
  }
}
