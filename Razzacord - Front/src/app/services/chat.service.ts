import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Message } from '../models/message.model';
import { AuthService } from './auth.service';
import { WebSocketService } from './websocket.service';
import { environment } from '../../environments/environment';
import { Subscription } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly _messages = signal<Message[]>([]);
  private readonly _loading = signal(false);
  private readonly _hasMore = signal(true);
  private readonly _unreadChannels = signal<Set<string>>(new Set());

  private wsSubscription?: Subscription;
  private lastSubscribedChannelId = '';
  private currentPage = 0;
  private readonly PAGE_SIZE = 50;

  readonly messagesForActiveChannel = computed<Message[]>(() => this._messages());
  readonly isLoading = this._loading.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly unreadChannels = this._unreadChannels.asReadonly();

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly wsService: WebSocketService
  ) {}

  /** Chamado ao selecionar um canal de texto */
  initChannel(channelId: string): void {
    if (channelId === this.lastSubscribedChannelId) return;

    this.lastSubscribedChannelId = channelId;
    this.currentPage = 0;
    this._messages.set([]);
    this._hasMore.set(true);

    // Marca canal como lido
    this.markAsRead(channelId);

    this.loadMessages(channelId, 0);
    this.subscribeToChannel(channelId);
  }

  /** Reseta estado quando sai do canal */
  resetChannel(): void {
    this.lastSubscribedChannelId = '';
    this._messages.set([]);
    this._hasMore.set(true);
    this._loading.set(false);
    this.unsubscribeCurrent();
  }

  loadMessages(channelId: string, page: number): void {
    this._loading.set(true);
    this.http
      .get<any[]>(`${environment.apiUrl}/channels/${channelId}/messages?page=${page}&size=${this.PAGE_SIZE}`)
      .subscribe({
        next: (data) => {
          if (channelId !== this.lastSubscribedChannelId) return;
          this._loading.set(false);
          if (data.length < this.PAGE_SIZE) {
            this._hasMore.set(false);
          }
          const mapped = this.mapMessages(data);
          if (page === 0) {
            this._messages.set(mapped);
          } else {
            // Carregou mais antigas — prepend
            this._messages.update((list) => [...mapped, ...list]);
          }
        },
        error: (err) => {
          if (channelId !== this.lastSubscribedChannelId) return;
          this._loading.set(false);
          console.error('[ChatService] Falha ao carregar mensagens:', err);
        },
      });
  }

  loadMore(channelId: string): void {
    if (!this._hasMore() || this._loading()) return;
    this.currentPage++;
    this.loadMessages(channelId, this.currentPage);
  }

  private mapMessages(data: any[]): Message[] {
    const mapped: Message[] = data.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      authorId: m.authorId,
      authorName: m.authorName,
      authorAvatarUrl: m.authorAvatarUrl,
      content: m.content,
      createdAt: new Date(m.createdAt),
      grouped: false,
      edited: m.edited ?? false,
      deleted: m.deleted ?? false,
      systemMessage: m.systemMessage ?? false,
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      attachmentName: m.attachmentName,
    }));

    // Calcular agrupamento
    for (let i = 1; i < mapped.length; i++) {
      const prev = mapped[i - 1];
      const curr = mapped[i];
      const timeDiff = curr.createdAt.getTime() - prev.createdAt.getTime();
      if (!prev.systemMessage && !curr.systemMessage && prev.authorId === curr.authorId && timeDiff < 5 * 60 * 1000) {
        curr.grouped = true;
      }
    }
    return mapped;
  }

  private subscribeToChannel(channelId: string): void {
    this.unsubscribeCurrent();
    this.wsSubscription = this.wsService
      .subscribe<any>(`/topic/channels/${channelId}`)
      .subscribe({
        next: (msg) => {
          if (msg.type === 'NEW_MESSAGE') {
            this.handleNewMessage(msg.data, channelId);
          } else if (msg.type === 'EDIT_MESSAGE') {
            this.handleEditMessage(msg.data);
          } else if (msg.type === 'DELETE_MESSAGE') {
            this.handleDeleteMessage(msg.data);
          } else {
            // Retrocompat: mensagem direta sem envelope
            this.handleNewMessage(msg, channelId);
          }
        },
        error: (err) => console.error('[ChatService] Erro WS:', err),
      });

    // Subscrever também ao canal de eventos
    this.wsService
      .subscribe<any>(`/topic/channels/${channelId}/events`)
      .subscribe({
        next: (event) => {
          if (event.type === 'EDIT_MESSAGE') this.handleEditMessage(event.data);
          if (event.type === 'DELETE_MESSAGE') this.handleDeleteMessage(event.data);
        },
      });
  }

  private handleNewMessage(msg: any, activeChannelId: string): void {
    const newMsg: Message = {
      id: msg.id,
      channelId: msg.channelId,
      authorId: msg.authorId,
      authorName: msg.authorName,
      authorAvatarUrl: msg.authorAvatarUrl,
      content: msg.content,
      createdAt: new Date(msg.createdAt),
      grouped: false,
      edited: msg.edited ?? false,
      deleted: msg.deleted ?? false,
      systemMessage: msg.systemMessage ?? false,
      attachmentUrl: msg.attachmentUrl,
      attachmentType: msg.attachmentType,
      attachmentName: msg.attachmentName,
    };

    this._messages.update((list) => {
      if (list.some((m) => m.id === newMsg.id)) return list;
      const last = list[list.length - 1];
      if (last && !last.systemMessage && !newMsg.systemMessage && last.authorId === newMsg.authorId) {
        const timeDiff = newMsg.createdAt.getTime() - last.createdAt.getTime();
        if (timeDiff < 5 * 60 * 1000) newMsg.grouped = true;
      }
      return [...list, newMsg];
    });

    // Se o canal da mensagem não é o ativo, marcar como não-lido
    const activeId = this.lastSubscribedChannelId;
    if (msg.channelId && msg.channelId !== activeId) {
      this._unreadChannels.update((s) => {
        const next = new Set(s);
        next.add(msg.channelId);
        return next;
      });

      // Notificação nativa do browser
      this.showBrowserNotification(newMsg);
    }
  }

  private handleEditMessage(data: any): void {
    this._messages.update((list) =>
      list.map((m) =>
        m.id === data.id ? { ...m, content: data.content, edited: true } : m
      )
    );
  }

  private handleDeleteMessage(data: any): void {
    this._messages.update((list) =>
      list.map((m) =>
        m.id === data.id ? { ...m, content: '[Mensagem deletada]', deleted: true } : m
      )
    );
  }

  markAsRead(channelId: string): void {
    this._unreadChannels.update((s) => {
      const next = new Set(s);
      next.delete(channelId);
      return next;
    });
  }

  private showBrowserNotification(msg: Message): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${msg.authorName}`, {
        body: msg.content.substring(0, 100),
        icon: msg.authorAvatarUrl,
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  private unsubscribeCurrent(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
      this.wsSubscription = undefined;
    }
  }

  sendMessage(
    content: string,
    channelId?: string,
    attachment?: { url: string; type: 'image' | 'file'; name: string }
  ): void {
    const trimmed = content.trim();
    if (!trimmed && !attachment) return;

    const chanId = channelId || this.lastSubscribedChannelId;
    const author = this.authService.currentUser();

    if (!chanId || !author.id) return;

    const payload: any = {
      channelId: chanId,
      authorId: author.id,
      content: trimmed,
    };

    if (attachment) {
      payload.attachmentUrl = attachment.url;
      payload.attachmentType = attachment.type;
      payload.attachmentName = attachment.name;
    }

    if (this.wsService.isConnected()) {
      this.wsService.send('/app/chat.send', payload);
    } else {
      this.http
        .post<any>(`${environment.apiUrl}/channels/${chanId}/messages`, payload)
        .subscribe({
          next: (saved) => this.handleNewMessage(saved, chanId),
          error: (err) => console.error('[ChatService] Falha ao enviar via HTTP:', err),
        });
    }
  }

  editMessage(messageId: string, content: string): void {
    if (this.wsService.isConnected()) {
      this.wsService.send('/app/message.edit', { messageId, content });
    } else {
      this.http.put<any>(`${environment.apiUrl}/messages/${messageId}`, { content }).subscribe({
        next: (updated) => this.handleEditMessage(updated),
        error: (err) => console.error('[ChatService] Erro ao editar mensagem:', err),
      });
    }
  }

  deleteMessage(messageId: string): void {
    if (this.wsService.isConnected()) {
      this.wsService.send('/app/message.delete', { messageId });
    } else {
      this.http.delete(`${environment.apiUrl}/messages/${messageId}`).subscribe({
        next: () => this.handleDeleteMessage({ id: messageId }),
        error: (err) => console.error('[ChatService] Erro ao deletar mensagem:', err),
      });
    }
  }
}