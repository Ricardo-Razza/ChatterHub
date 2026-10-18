import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { User, PresenceStatus, UserRole } from '../models/user.model';

export interface AuthResponse {
  token: string;
  user: any;
}

function mapUser(raw: any): User {
  return {
    id: raw.id,
    username: raw.username,
    avatarUrl:
      raw.avatarUrl ||
      `https://api.dicebear.com/7.x/thumbs/svg?seed=${raw.username}&backgroundColor=5865f2`,
    status: ((raw.status ? raw.status.toLowerCase() : 'online') as PresenceStatus),
    role: ((raw.role ? raw.role.toUpperCase() : 'MEMBER') as UserRole),
    isMuted: raw.muted ?? raw.isMuted ?? false,
    isDeafened: raw.deafened ?? raw.isDeafened ?? false,
    isCameraOn: raw.cameraOn ?? raw.isCameraOn ?? false,
    isSharingScreen: raw.sharingScreen ?? raw.isSharingScreen ?? false,
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _token = signal<string>('');
  private readonly _currentUser = signal<User | null>(null);

  readonly token = this._token.asReadonly();

  readonly currentUser = computed<User>(() => {
    const u = this._currentUser();
    if (u) return u;
    return {
      id: '',
      username: 'Carregando...',
      avatarUrl: 'https://api.dicebear.com/7.x/thumbs/svg?seed=guest&backgroundColor=5865f2',
      status: 'online',
      role: 'MEMBER',
    };
  });

  readonly isLoggedIn = computed<boolean>(() => {
    const u = this._currentUser();
    return !!(u && u.id && this._token());
  });

  readonly isAdmin = computed<boolean>(() => this.currentUser().role === 'ADMIN');

  constructor(private readonly http: HttpClient) {
    this.restoreSession();
  }

  private restoreSession(): void {
    const token = localStorage.getItem('ch_token') || sessionStorage.getItem('ch_token');
    const raw = localStorage.getItem('ch_user') || sessionStorage.getItem('ch_user');
    if (token && raw) {
      try {
        const u = JSON.parse(raw);
        if (u.id) {
          this._token.set(token);
          this._currentUser.set(u);
        }
      } catch (_) {}
    }
  }

  private persistSession(token: string, user: User, remember: boolean): void {
    this._token.set(token);
    this._currentUser.set(user);
    // sempre armazena em sessionStorage (dura até fechar a aba)
    sessionStorage.setItem('ch_token', token);
    sessionStorage.setItem('ch_user', JSON.stringify(user));
    if (remember) {
      localStorage.setItem('ch_token', token);
      localStorage.setItem('ch_user', JSON.stringify(user));
    }
  }

  register(username: string, password: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.http
        .post<AuthResponse>(`${environment.apiUrl}/users/register`, { username, password })
        .subscribe({
          next: (res) => {
            const user = mapUser(res.user);
            this.persistSession(res.token, user, false);
            resolve(user);
          },
          error: (err) => reject(err?.error?.message || err?.message || 'Erro ao criar conta'),
        });
    });
  }

  login(username: string, password: string, remember = false): Promise<User> {
    return new Promise((resolve, reject) => {
      this.http
        .post<AuthResponse>(`${environment.apiUrl}/users/login`, { username, password })
        .subscribe({
          next: (res) => {
            const user = mapUser(res.user);
            this.persistSession(res.token, user, remember);
            resolve(user);
          },
          error: (err) => reject(err?.error?.message || err?.message || 'Usuário ou senha inválidos'),
        });
    });
  }

  logout(): void {
    sessionStorage.removeItem('ch_token');
    sessionStorage.removeItem('ch_user');
    localStorage.removeItem('ch_token');
    localStorage.removeItem('ch_user');
    this._token.set('');
    this._currentUser.set(null);
    window.location.reload();
  }

  getToken(): string {
    return this._token() || sessionStorage.getItem('ch_token') || '';
  }

  updateCurrentUser(updatedUser: Partial<User>): void {
    this._currentUser.update((u) => (u ? { ...u, ...updatedUser } : null));
    const token = this.getToken();
    const user = this._currentUser();
    if (user) {
      sessionStorage.setItem('ch_user', JSON.stringify(user));
      if (localStorage.getItem('ch_token')) {
        localStorage.setItem('ch_user', JSON.stringify(user));
      }
    }
  }

  /** Usado por outros serviços para mapear raw API response -> User */
  static mapUser(raw: any): User {
    return mapUser(raw);
  }
}
