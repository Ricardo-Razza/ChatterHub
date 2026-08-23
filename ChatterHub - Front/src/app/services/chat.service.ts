import { Injectable, computed, signal, effect } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Subscription } from "rxjs";
import { Message } from "../models/message.model";
import { ChannelService } from "./channel.service";
import { UserService } from "./user.service";
import { WebSocketService } from "./websocket.service";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class ChatService {
  private readonly _messages = signal<Message[]>([]);
  private wsSubscription?: Subscription;
  private lastSubscribedChannelId = "";

  constructor(
    private readonly http: HttpClient,
    private readonly channelService: ChannelService,
    private readonly userService: UserService,
    private readonly wsService: WebSocketService
  ) {
    effect(() => {
      const channelId = this.channelService.activeChannelId();
      const mode = this.channelService.mainAreaMode();

      if (channelId && mode === "text") {
        // Só recarrega se mudou de canal
        if (channelId !== this.lastSubscribedChannelId) {
          this.lastSubscribedChannelId = channelId;
          this.loadMessages(channelId);
          this.subscribeToChannel(channelId);
        }
      } else {
        this.lastSubscribedChannelId = "";
        this._messages.set([]);
        this.unsubscribeCurrent();
      }
    }, { allowSignalWrites: true });
  }

  private unsubscribeCurrent(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
      this.wsSubscription = undefined;
    }
  }

  loadMessages(channelId: string): void {
    this.http
      .get<any[]>(`${environment.apiUrl}/channels/${channelId}/messages`)
      .subscribe({
        next: (data) => {
          const mapped: Message[] = data.map((m) => ({
            id: m.id,
            channelId: m.channelId,
            authorId: m.authorId,
            authorName: m.authorName,
            authorAvatarUrl: m.authorAvatarUrl,
            content: m.content,
            createdAt: new Date(m.createdAt),
            grouped: m.grouped ?? false,
          }));
          this._messages.set(mapped);
        },
        error: (err) => console.error("[ChatService] Falha ao carregar mensagens:", err),
      });
  }

  private subscribeToChannel(channelId: string): void {
    this.unsubscribeCurrent();
    this.wsSubscription = this.wsService
      .subscribe<any>(`/topic/channels/${channelId}`)
      .subscribe({
        next: (msg) => {
          const newMsg: Message = {
            id: msg.id,
            channelId: msg.channelId,
            authorId: msg.authorId,
            authorName: msg.authorName,
            authorAvatarUrl: msg.authorAvatarUrl,
            content: msg.content,
            createdAt: new Date(msg.createdAt),
            grouped: msg.grouped ?? false,
          };

          this._messages.update((list) => {
            if (list.some((m) => m.id === newMsg.id)) return list;
            const last = list[list.length - 1];
            if (last && last.authorId === newMsg.authorId) {
              newMsg.grouped = true;
            }
            return [...list, newMsg];
          });
        },
        error: (err) => console.error("[ChatService] Erro WS:", err),
      });
  }

  readonly messagesForActiveChannel = computed<Message[]>(() => this._messages());

  sendMessage(content: string): void {
    if (!content.trim()) return;

    const channelId = this.channelService.activeChannelId();
    const author = this.userService.currentUser();

    if (!channelId || !author.id) {
      console.warn("[ChatService] Não é possível enviar: channelId ou userId ausente", { channelId, userId: author.id });
      return;
    }

    const payload = { channelId, authorId: author.id, content: content.trim() };

    // Tenta via WebSocket primeiro
    if (this.wsService.isConnected()) {
      this.wsService.send("/app/chat.send", payload);
    } else {
      // Fallback via HTTP POST se WS não estiver conectado
      this.http.post<any>(
        `${environment.apiUrl}/channels/${channelId}/messages`,
        payload
      ).subscribe({
        next: (saved) => {
          const newMsg: Message = {
            id: saved.id,
            channelId: saved.channelId,
            authorId: saved.authorId,
            authorName: saved.authorName,
            authorAvatarUrl: saved.authorAvatarUrl,
            content: saved.content,
            createdAt: new Date(saved.createdAt),
            grouped: false,
          };
          this._messages.update((list) => {
            const last = list[list.length - 1];
            if (last && last.authorId === newMsg.authorId) newMsg.grouped = true;
            return [...list, newMsg];
          });
        },
        error: (err) => console.error("[ChatService] Falha ao enviar via HTTP:", err),
      });
    }
  }
}