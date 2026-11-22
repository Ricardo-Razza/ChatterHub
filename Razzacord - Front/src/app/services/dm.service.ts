import { Injectable, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DirectMessage, DmConversation } from '../models/direct-message.model';
import { AuthService } from './auth.service';
import { WebSocketService } from './websocket.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DmService {
  private readonly _conversations = signal<DmConversation[]>([]);
  private readonly _messages = signal<DirectMessage[]>([]);
  private readonly _activeDmUserId = signal<string>('');
  private readonly _loading = signal(false);
  private wsSubscription?: Subscription;

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeDmUserId = this._activeDmUserId.asReadonly();
  readonly isLoading = this._loading.asReadonly();

  readonly totalUnread = computed<number>(() =>
    this._conversations().reduce((acc, c) => acc + c.unreadCount, 0)
  );

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly wsService: WebSocketService
  ) {
    effect(() => {
      const me = this.authService.currentUser();
      if (me.id && this.authService.isLoggedIn()) {
        this.loadConversations();
        this.subscribeToMyDMs(me.id);
      } else {
        this._conversations.set([]);
        this._messages.set([]);
      }
    }, { allowSignalWrites: true });
  }

  loadConversations(): void {
    this.http.get<any[]>(`${environment.apiUrl}/dm/conversations`).subscribe({
      next: (data) => {
        const mapped: DmConversation[] = data.map((c) => ({
          userId: c.userId,
          username: c.username,
          avatarUrl: c.avatarUrl,
          lastMessage: c.lastMessage,
          lastMessageAt: new Date(c.lastMessageAt),
          unreadCount: c.unreadCount ?? 0,
        }));
        this._conversations.set(mapped);
      },
      error: (err) => console.error('[DmService] Erro ao carregar conversas:', err),
    });
  }

  openDm(userId: string): void {
    this._activeDmUserId.set(userId);
    this._messages.set([]);
    this._loading.set(true);

    this.http.get<any[]>(`${environment.apiUrl}/dm/${userId}?page=0&size=50`).subscribe({
      next: (data) => {
        this._loading.set(false);
        this._messages.set(data.map(this.mapDm));
        // zera unread da conversa
        this._conversations.update((list) =>
          list.map((c) => (c.userId === userId ? { ...c, unreadCount: 0 } : c))
        );
      },
      error: (err) => {
        this._loading.set(false);
        console.error('[DmService] Erro ao carregar DMs:', err);
      },
    });
  }

  sendDm(receiverId: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) return;

    const payload = { receiverId, content: trimmed };

    if (this.wsService.isConnected()) {
      this.wsService.send('/app/dm.send', payload);
    } else {
      this.http.post<any>(`${environment.apiUrl}/dm/${receiverId}`, { content: trimmed }).subscribe({
        next: (saved) => this._messages.update((list) => [...list, this.mapDm(saved)]),
        error: (err) => console.error('[DmService] Erro ao enviar DM:', err),
      });
    }
  }

  closeDm(): void {
    this._activeDmUserId.set('');
    this._messages.set([]);
  }

  private subscribeToMyDMs(myId: string): void {
    if (this.wsSubscription) this.wsSubscription.unsubscribe();

    this.wsSubscription = this.wsService
      .subscribe<any>(`/topic/dm/${myId}`)
      .subscribe({
        next: (msg) => {
          const dm = this.mapDm(msg);
          // se a conversa está aberta, adicionar mensagem
          if (this._activeDmUserId() === dm.senderId || this._activeDmUserId() === dm.receiverId) {
            this._messages.update((list) => {
              if (list.some((m) => m.id === dm.id)) return list;
              return [...list, dm];
            });
          } else {
            // incrementar badge da conversa
            this._conversations.update((list) => {
              const exists = list.find((c) => c.userId === dm.senderId);
              if (exists) {
                return list.map((c) =>
                  c.userId === dm.senderId
                    ? { ...c, unreadCount: c.unreadCount + 1, lastMessage: dm.content, lastMessageAt: dm.createdAt }
                    : c
                );
              }
              // nova conversa
              return [
                {
                  userId: dm.senderId,
                  username: dm.senderName,
                  avatarUrl: dm.senderAvatarUrl,
                  lastMessage: dm.content,
                  lastMessageAt: dm.createdAt,
                  unreadCount: 1,
                },
                ...list,
              ];
            });
          }
        },
      });
  }

  private mapDm(raw: any): DirectMessage {
    return {
      id: raw.id,
      senderId: raw.senderId,
      receiverId: raw.receiverId,
      senderName: raw.senderName,
      senderAvatarUrl: raw.senderAvatarUrl,
      content: raw.content,
      createdAt: new Date(raw.createdAt),
      read: raw.read ?? false,
    };
  }
}
