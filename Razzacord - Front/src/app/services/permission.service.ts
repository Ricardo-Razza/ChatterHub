import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ServerService } from './server.service';
import { AuthService } from './auth.service';
import { WebSocketService } from './websocket.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly _permissions = signal(0);
  private readonly _isOwner = signal(false);
  private readonly _topPosition = signal(0);
  private readonly _defaultPermissions = signal(0);

  readonly permissions = this._permissions.asReadonly();
  readonly isOwner = this._isOwner.asReadonly();
  readonly topPosition = this._topPosition.asReadonly();
  readonly defaultPermissions = this._defaultPermissions.asReadonly();

  private sub?: Subscription;
  private serverId = '';

  constructor(
    private readonly http: HttpClient,
    private readonly serverService: ServerService,
    private readonly authService: AuthService,
    private readonly ws: WebSocketService
  ) {
    effect(() => {
      const id = this.serverService.activeServerId();
      this.serverId = id;
      this.sub?.unsubscribe();
      this.sub = undefined;
      this._permissions.set(0);
      this._isOwner.set(false);
      this._topPosition.set(0);
      this._defaultPermissions.set(0);
      if (!id) return;
      this.reload();
      this.sub = this.ws.subscribe<any>(`/topic/servers/${id}/events`).subscribe((ev) => {
        const me = this.authService.currentUser().id;
        if (ev.type === 'roles' || (ev.type === 'member-roles' && ev.userId === me)) this.reload();
      });
    }, { allowSignalWrites: true });
  }

  can(bit: number): boolean {
    return this._isOwner() || (this._permissions() & bit) === bit;
  }

  reload(): void {
    const id = this.serverId;
    if (!id) return;
    this.http
      .get<{ permissions: number; owner: boolean; topPosition: number; defaultPermissions: number }>(`${environment.apiUrl}/servers/${id}/me/permissions`)
      .subscribe({
        next: (r) => {
          if (id !== this.serverId) return;
          this._permissions.set(r.permissions);
          this._isOwner.set(r.owner);
          this._topPosition.set(r.topPosition);
          this._defaultPermissions.set(r.defaultPermissions ?? 0);
        },
        error: (err) => console.error('[PermissionService] Falha ao carregar permissões:', err),
      });
  }
}
