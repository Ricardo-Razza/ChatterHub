import { Injectable, effect } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client;
  private connected$ = new BehaviorSubject<boolean>(false);
  private reconnected$ = new Subject<void>();
  private _isConnected = false;
  private pendingQueue: Array<{ destination: string; body: any }> = [];

  constructor(private readonly authService: AuthService) {
    const wsUrl = environment.wsUrl.startsWith('http')
      ? environment.wsUrl
      : `${window.location.protocol}//${window.location.host}${environment.wsUrl}`;

    this.client = new Client({
      webSocketFactory: () => {
        const Sock = typeof SockJS === 'function' ? SockJS : (SockJS as any).default;
        return new Sock(wsUrl);
      },
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      // O token é lido a cada (re)conexão: antes ficava congelado no valor de quando o serviço foi criado.
      beforeConnect: () => {
        this.client.connectHeaders = { Authorization: `Bearer ${this.authService.getToken()}` };
      },
      debug: () => {},
      onConnect: () => {
        this._isConnected = true;
        this.connected$.next(true);
        this.flushPendingQueue();
        this.reconnected$.next();
      },
      onStompError: (frame) => {
        const message = frame.headers['message'] || '';
        console.error('[WebSocket] Erro STOMP:', message);
        // Token expirado/inválido: não adianta ficar reconectando com ele.
        if (/token|autenticad/i.test(message)) {
          this.authService.logout();
        }
      },
      onWebSocketClose: () => {
        this._isConnected = false;
        this.connected$.next(false);
      },
    });

    // Conecta só com sessão ativa e desconecta no logout.
    effect(() => {
      if (this.authService.isLoggedIn()) {
        if (!this.client.active) this.client.activate();
      } else if (this.client.active) {
        void this.client.deactivate();
      }
    });
  }

  isConnected(): boolean {
    return this._isConnected && this.client.connected;
  }

  get onConnected$(): Observable<boolean> {
    return this.connected$.asObservable();
  }

  /** Emite cada vez que reconecta (útil para refazer o estado de voz) */
  get onReconnected$(): Observable<void> {
    return this.reconnected$.asObservable();
  }

  subscribe<T>(topic: string): Observable<T> {
    return new Observable<T>((observer) => {
      let sub: StompSubscription | undefined;

      const setupSubscription = () => {
        if (this.client.connected && !sub) {
          try {
            sub = this.client.subscribe(topic, (message: IMessage) => {
              try {
                const parsed: T = JSON.parse(message.body);
                observer.next(parsed);
              } catch (err) {
                console.error('[WebSocket] Falha ao parsear JSON do tópico', topic, err);
              }
            });
          } catch (err) {
            console.error('[WebSocket] Erro ao subscribir no tópico', topic, err);
          }
        }
      };

      if (this.client.connected) {
        setupSubscription();
      }

      const connSub = this.connected$.subscribe((isConn) => {
        if (isConn && !sub) {
          setupSubscription();
        } else if (!isConn && sub) {
          try { sub.unsubscribe(); } catch (_) {}
          sub = undefined;
        }
      });

      return () => {
        connSub.unsubscribe();
        if (sub) {
          try { sub.unsubscribe(); } catch (_) {}
          sub = undefined;
        }
      };
    });
  }

  send(destination: string, body: any): void {
    if (this.client.connected) {
      this.client.publish({
        destination,
        body: JSON.stringify(body),
      });
    } else {
      this.pendingQueue.push({ destination, body });
    }
  }

  private flushPendingQueue(): void {
    while (this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift();
      if (item && this.client.connected) {
        this.client.publish({
          destination: item.destination,
          body: JSON.stringify(item.body),
        });
      }
    }
  }
}
