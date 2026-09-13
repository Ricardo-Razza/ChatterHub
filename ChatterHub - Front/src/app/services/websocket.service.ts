import { Injectable } from "@angular/core";
import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Observable, BehaviorSubject } from "rxjs";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class WebSocketService {
  private client: Client;
  private connected$ = new BehaviorSubject<boolean>(false);
  private _isConnected = false;
  private pendingQueue: Array<{ destination: string; body: any }> = [];

  constructor() {
    const wsUrl = environment.wsUrl.startsWith("http")
      ? environment.wsUrl
      : `${window.location.protocol}//${window.location.host}${environment.wsUrl}`;

    console.log("[WebSocket] Conectando STOMP em:", wsUrl);

    this.client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 3000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str) => console.log("[STOMP]", str),
    });

    this.client.onConnect = () => {
      console.log("[WebSocket] Conectado ao servidor STOMP");
      this._isConnected = true;
      this.connected$.next(true);
      this.flushPendingQueue();
    };

    this.client.onStompError = (frame) => {
      console.error("[WebSocket] Erro STOMP: ", frame.headers["message"], frame.body);
    };

    this.client.onWebSocketClose = () => {
      console.warn("[WebSocket] Conexão WebSocket encerrada.");
      this._isConnected = false;
      this.connected$.next(false);
    };

    this.client.activate();
  }

  isConnected(): boolean {
    return this._isConnected && this.client.connected;
  }

  get onConnected$(): Observable<boolean> {
    return this.connected$.asObservable();
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
                console.error("[WebSocket] Falha ao processar mensagem JSON", err);
              }
            });
          } catch (err) {
            console.error("[WebSocket] Erro ao subscrever no tópico", topic, err);
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
          try {
            sub.unsubscribe();
          } catch (e) {}
          sub = undefined;
        }
      });

      return () => {
        connSub.unsubscribe();
        if (sub) {
          try {
            sub.unsubscribe();
          } catch (e) {}
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
      console.log("[WebSocket] Conexão pendente. Enfileirando mensagem para:", destination);
      this.pendingQueue.push({ destination, body });
    }
  }

  private flushPendingQueue(): void {
    if (this.pendingQueue.length === 0) return;
    console.log(`[WebSocket] Descarregando ${this.pendingQueue.length} mensagem(ns) pendente(s)...`);
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