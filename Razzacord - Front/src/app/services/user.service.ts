import { Injectable, computed, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, PresenceStatus, UserRole } from '../models/user.model';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly _users = signal<User[]>([]);

  readonly users = this._users.asReadonly();

  /** Proxy para o usuário atual do AuthService */
  readonly currentUser = computed<User>(() => this.authService.currentUser());
  readonly isLoggedIn = computed<boolean>(() => this.authService.isLoggedIn());
  readonly isAdmin = computed<boolean>(() => this.authService.isAdmin());

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {
    effect(() => {
      if (this.isLoggedIn()) {
        this.loadUsers();
      } else {
        this._users.set([]);
      }
    }, { allowSignalWrites: true });
  }

  loadUsers(): void {
    this.http.get<any[]>(`${environment.apiUrl}/users`).subscribe({
      next: (data) => {
        const mapped = data.map(AuthService.mapUser);
        this._users.set(mapped);
      },
      error: (err) => console.error('[UserService] Erro ao carregar usuários:', err),
    });
  }

  getUsersByIds(ids: string[]): User[] {
    return this._users().filter((u) => ids.includes(u.id));
  }

  updateProfile(data: {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const cur = this.currentUser();
      if (!cur?.id) return reject('Usuário não logado');

      this.http
        .put<any>(`${environment.apiUrl}/users/${cur.id}/profile`, data)
        .subscribe({
          next: (updated) => {
            this.authService.updateCurrentUser(AuthService.mapUser(updated));
            this.loadUsers();
            resolve();
          },
          error: (err) =>
            reject(err?.error?.message || err?.message || 'Erro ao atualizar dados'),
        });
    });
  }

  updateUserRole(userId: string, role: UserRole): void {
    this.http
      .patch<any>(`${environment.apiUrl}/users/${userId}/role`, { role })
      .subscribe({
        next: () => this.loadUsers(),
        error: (err) => console.error('[UserService] Erro ao atualizar cargo:', err),
      });
  }

  updateUserStatus(status: PresenceStatus): void {
    const cur = this.currentUser();
    if (!cur?.id) return;
    this.http
      .patch<any>(
        `${environment.apiUrl}/users/${cur.id}/status?status=${status.toUpperCase()}`,
        {}
      )
      .subscribe({
        next: () => this.authService.updateCurrentUser({ status }),
        error: (err) => console.error('[UserService] Erro ao atualizar status:', err),
      });
  }

  deleteUser(userId: string): void {
    this.http.delete(`${environment.apiUrl}/users/${userId}`).subscribe({
      next: () => this.loadUsers(),
      error: (err) => console.error('[UserService] Erro ao remover usuário:', err),
    });
  }

  toggleMute(): void {
    const cur = this.currentUser();
    this.authService.updateCurrentUser({ isMuted: !cur.isMuted });
  }

  toggleDeafen(): void {
    const cur = this.currentUser();
    this.authService.updateCurrentUser({ isDeafened: !cur.isDeafened });
  }

  toggleCamera(): void {
    const cur = this.currentUser();
    this.authService.updateCurrentUser({ isCameraOn: !cur.isCameraOn });
  }
}