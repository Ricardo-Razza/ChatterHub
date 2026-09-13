import { Injectable, computed, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { User, PresenceStatus, UserRole } from "../models/user.model";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class UserService {
  private readonly _users = signal<User[]>([]);
  private readonly _currentUser = signal<User | null>(null);

  readonly users = this._users.asReadonly();

  readonly currentUser = computed<User>(() => {
    const u = this._currentUser();
    if (u) return u;
    return {
      id: "",
      username: "Carregando...",
      email: "",
      phone: "",
      ageGroup: "Não confirmado",
      avatarUrl: "https://api.dicebear.com/7.x/thumbs/svg?seed=guest&backgroundColor=5865f2",
      status: "online",
      role: "MEMBER",
    };
  });

  readonly isLoggedIn = computed<boolean>(() => {
    const u = this._currentUser();
    return !!(u && u.id);
  });

  readonly isAdmin = computed<boolean>(() => {
    return this.currentUser().role === "ADMIN";
  });

  constructor(private readonly http: HttpClient) {
    this.restoreSession();
  }

  private restoreSession(): void {
    const raw = sessionStorage.getItem("ch_user") || localStorage.getItem("ch_user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u.id) {
          this._currentUser.set(u);
          sessionStorage.setItem("ch_user", raw);
        }
      } catch (e) {}
    }
    this.loadUsers();
  }

  loadUsers(): void {
    this.http.get<any[]>(`${environment.apiUrl}/users`).subscribe({
      next: (data) => {
        const mapped: User[] = data.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          phone: u.phone,
          ageGroup: u.ageGroup,
          birthDate: u.birthDate,
          avatarUrl: u.avatarUrl,
          status: (u.status ? u.status.toLowerCase() : "online") as PresenceStatus,
          role: (u.role ? u.role.toUpperCase() : "MEMBER") as UserRole,
          emailVerified: u.emailVerified ?? false,
          isMuted: u.muted ?? u.isMuted ?? false,
          isDeafened: u.deafened ?? u.isDeafened ?? false,
          isSpeaking: u.speaking ?? u.isSpeaking ?? false,
          isCameraOn: u.cameraOn ?? u.isCameraOn ?? false,
          isSharingScreen: u.sharingScreen ?? u.isSharingScreen ?? false,
        }));

        this._users.set(mapped);

        // Se o usuário atual estiver logado, atualiza seus dados com a lista mais recente do servidor
        const cur = this._currentUser();
        if (cur && cur.id) {
          const fresh = mapped.find(m => m.id === cur.id);
          if (fresh) {
            this._currentUser.set(fresh);
            const serialized = JSON.stringify(fresh);
            sessionStorage.setItem("ch_user", serialized);
            const localRaw = localStorage.getItem("ch_user");
            if (localRaw) {
              try {
                const localUser = JSON.parse(localRaw);
                if (localUser.id === fresh.id) {
                  localStorage.setItem("ch_user", serialized);
                }
              } catch (e) {}
            }
          }
        }
      },
      error: (err) => console.error("[UserService] Erro ao carregar usuários:", err),
    });
  }

  register(data: { username: string; email: string; password: string; phone?: string; birthDate?: string }): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/users/register`, data).subscribe({
        next: (created) => {
          this.loadUsers();
          resolve(created);
        },
        error: (err) => reject(err?.error?.message || err?.message || "Erro ao criar conta"),
      });
    });
  }

  verifyEmail(email: string, code: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/users/verify-email`, { email, code }).subscribe({
        next: (verified) => {
          const user: User = {
            id: verified.id,
            username: verified.username,
            email: verified.email,
            phone: verified.phone,
            ageGroup: verified.ageGroup,
            birthDate: verified.birthDate,
            avatarUrl: verified.avatarUrl,
            status: (verified.status ? verified.status.toLowerCase() : "online") as PresenceStatus,
            role: (verified.role ? verified.role.toUpperCase() : "MEMBER") as UserRole,
            emailVerified: true,
          };
          this._currentUser.set(user);
          const serialized = JSON.stringify(user);
          sessionStorage.setItem("ch_user", serialized);
          localStorage.setItem("ch_user", serialized);
          this.loadUsers();
          resolve(user);
        },
        error: (err) => reject(err?.error?.message || err?.message || "Código inválido"),
      });
    });
  }

  login(usernameOrEmail: string, password: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/users/login`, { usernameOrEmail, password }).subscribe({
        next: (res) => {
          const user: User = {
            id: res.id,
            username: res.username,
            email: res.email,
            phone: res.phone,
            ageGroup: res.ageGroup,
            birthDate: res.birthDate,
            avatarUrl: res.avatarUrl,
            status: (res.status ? res.status.toLowerCase() : "online") as PresenceStatus,
            role: (res.role ? res.role.toUpperCase() : "MEMBER") as UserRole,
            emailVerified: res.emailVerified,
          };
          this._currentUser.set(user);
          const serialized = JSON.stringify(user);
          sessionStorage.setItem("ch_user", serialized);
          localStorage.setItem("ch_user", serialized);
          this.loadUsers();
          resolve(user);
        },
        error: (err) => reject(err?.error?.message || err?.message || "Falha no login"),
      });
    });
  }

  updateProfile(data: { username?: string; email?: string; phone?: string; birthDate?: string; currentPassword?: string; newPassword?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const cur = this._currentUser();
      if (!cur || !cur.id) return reject("Usuário não logado");

      this.http.put<any>(`${environment.apiUrl}/users/${cur.id}/profile`, data).subscribe({
        next: (updated) => {
          const freshUser: User = {
            ...cur,
            username: updated.username,
            email: updated.email,
            phone: updated.phone,
            ageGroup: updated.ageGroup,
            birthDate: updated.birthDate,
            avatarUrl: updated.avatarUrl,
          };
          this._currentUser.set(freshUser);
          const serialized = JSON.stringify(freshUser);
          sessionStorage.setItem("ch_user", serialized);
          localStorage.setItem("ch_user", serialized);
          this.loadUsers();
          resolve();
        },
        error: (err) => reject(err?.error?.message || err?.message || "Erro ao atualizar dados"),
      });
    });
  }

  updateUserRole(userId: string, role: UserRole): void {
    this.http.patch<any>(`${environment.apiUrl}/users/${userId}/role`, { role }).subscribe({
      next: () => {
        this.loadUsers();
      },
      error: (err) => console.error("[UserService] Erro ao atualizar cargo:", err),
    });
  }

  updateUserStatus(status: PresenceStatus): void {
    const cur = this._currentUser();
    if (!cur || !cur.id) return;
    this.http.patch<any>(`${environment.apiUrl}/users/${cur.id}/status?status=${status.toUpperCase()}`, {}).subscribe({
      next: () => {
        this._currentUser.update(u => u ? { ...u, status } : null);
      },
    });
  }

  deleteUser(userId: string): void {
    this.http.delete(`${environment.apiUrl}/users/${userId}`).subscribe({
      next: () => {
        this.loadUsers();
      },
      error: (err) => console.error("[UserService] Erro ao remover usuário:", err),
    });
  }

  logout(): void {
    sessionStorage.removeItem("ch_user");
    localStorage.removeItem("ch_user");
    this._currentUser.set(null);
    window.location.reload();
  }

  getUsersByIds(ids: string[]): User[] {
    return this._users().filter((u) => ids.includes(u.id));
  }

  toggleMute(): void {
    this._currentUser.update((u) => u ? { ...u, isMuted: !u.isMuted } : null);
  }

  toggleDeafen(): void {
    this._currentUser.update((u) => u ? { ...u, isDeafened: !u.isDeafened } : null);
  }

  toggleCamera(): void {
    this._currentUser.update((u) => u ? { ...u, isCameraOn: !u.isCameraOn } : null);
  }
}