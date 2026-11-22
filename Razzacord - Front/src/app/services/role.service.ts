import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';
import { ServerRole, ServerMember } from '../models/role.model';
import { PresenceStatus } from '../models/user.model';
import { ServerService } from './server.service';
import { AuthService } from './auth.service';
import { WebSocketService } from './websocket.service';
import { ToastService } from './toast.service';
import { environment } from '../../environments/environment';

export interface RoleRequest {
  name?: string;
  color?: string;
  permissions?: number;
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly _roles = signal<ServerRole[]>([]);
  private readonly _members = signal<ServerMember[]>([]);
  readonly roles = this._roles.asReadonly();
  readonly members = this._members.asReadonly();

  private sub?: Subscription;
  private serverId = '';

  constructor(
    private readonly http: HttpClient,
    private readonly serverService: ServerService,
    private readonly authService: AuthService,
    private readonly ws: WebSocketService,
    private readonly toast: ToastService
  ) {
    effect(() => {
      const id = this.serverService.activeServerId();
      this.serverId = id;
      this.sub?.unsubscribe();
      this.sub = undefined;
      this._roles.set([]);
      this._members.set([]);
      if (!id) return;
      this.load();
      this.sub = this.ws.subscribe<any>(`/topic/servers/${id}/events`).subscribe((ev) => {
        if (ev.type === 'roles' || ev.type === 'member-roles') {
          this.load();
        } else if (ev.type === 'member-removed') {
          if (ev.userId === this.authService.currentUser().id) {
            this.toast.info('Você foi removido do servidor');
            this.serverService.loadServers();
          } else {
            this.load();
          }
        }
      });
    }, { allowSignalWrites: true });
  }

  private get base(): string {
    return `${environment.apiUrl}/servers/${this.serverId}`;
  }

  load(): void {
    const id = this.serverId;
    if (!id) return;
    this.http.get<ServerRole[]>(`${this.base}/roles`).subscribe({
      next: (r) => { if (id === this.serverId) this._roles.set(r); },
      error: (err) => console.error('[RoleService] Falha ao carregar cargos:', err),
    });
    this.http.get<any[]>(`${this.base}/members`).subscribe({
      next: (data) => {
        if (id !== this.serverId) return;
        this._members.set(data.map((m) => ({
          id: m.id,
          username: m.username,
          avatarUrl: m.avatarUrl,
          status: String(m.status ?? 'OFFLINE').toLowerCase() as PresenceStatus,
          owner: !!m.owner,
          roleIds: m.roleIds ?? [],
        })));
      },
      error: (err) => console.error('[RoleService] Falha ao carregar membros:', err),
    });
  }

  create(req: RoleRequest): Promise<ServerRole> {
    return this.run(this.http.post<ServerRole>(`${this.base}/roles`, req), () => this.load());
  }

  update(id: string, req: RoleRequest): Promise<ServerRole> {
    return this.run(this.http.put<ServerRole>(`${this.base}/roles/${id}`, req), () => this.load());
  }

  remove(id: string): Promise<void> {
    return this.run(this.http.delete<void>(`${this.base}/roles/${id}`), () => this.load());
  }

  /** ids do mais alto para o mais baixo */
  reorder(ids: string[]): Promise<ServerRole[]> {
    return this.run(this.http.put<ServerRole[]>(`${this.base}/roles/order`, { roleIds: ids }), (r) => {
      if (Array.isArray(r)) this._roles.set(r); else this.load();
    });
  }

  setMemberRoles(userId: string, ids: string[]): Promise<ServerMember> {
    return this.run(this.http.put<ServerMember>(`${this.base}/members/${userId}/roles`, { roleIds: ids }), () => this.load());
  }

  setDefaultPermissions(n: number): Promise<void> {
    return this.run(this.http.put<void>(`${this.base}/default-permissions`, { permissions: n }), () => {});
  }

  /** Cor do cargo de maior posição do membro, ou null. */
  colorFor(userId: string): string | null {
    const member = this._members().find((m) => m.id === userId);
    if (!member) return null;
    const top = this._roles()
      .filter((r) => member.roleIds.includes(r.id))
      .sort((a, b) => b.position - a.position)[0];
    return top?.color ?? null;
  }

  /** Remove um membro (expulsar); erros viram toast. */
  async kick(userId: string): Promise<void> {
    try {
      await this.serverService.kickMember(this.serverId, userId);
      this.load();
    } catch (e) {
      this.toast.error(String(e));
      throw e;
    }
  }

  private run<T>(obs: Observable<T>, onOk: (r: T) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      obs.subscribe({
        next: (r) => { onOk(r); resolve(r); },
        error: (err) => {
          const msg = err?.error?.message || err?.message || 'Erro na operação';
          this.toast.error(msg);
          reject(msg);
        },
      });
    });
  }
}
