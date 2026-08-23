import { Injectable } from "@angular/core";
import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Observable, Subject } from "rxjs";
import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class WebSocketService {
  private client: Client;
  private connected$ = new Subject<boolean>();
  private _isConnected = false;

  constructor() {
    this.client = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = () => {
      console.log("[WebSocket] Conectado ao servidor STOMP");
      this._isConnected = true;
      this.connected$.next(true);
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

  subscribe<T>(topic: string): Observable<T> {
    return new Observable<T>((observer) => {
      let sub: StompSubscription | undefined;

      const setupSubscription = () => {
        if (this.client.connected) {
          sub = this.client.subscribe(topic, (message: IMessage) => {
            try {
              const parsed: T = JSON.parse(message.body);
              observer.next(parsed);
            } catch (err) {
              console.error("[WebSocket] Falha ao processar mensagem JSON", err);
            }
          });
        }
      };

      if (this.client.connected) {
        setupSubscription();
      } else {
        const connSub = this.connected$.subscribe((isConn) => {
          if (isConn && !sub) {
            setupSubscription();
          }
        });
        return () => {
          connSub.unsubscribe();
          sub?.unsubscribe();
        };
      }

      return () => {
        sub?.unsubscribe();
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
      console.warn("[WebSocket] Não conectado. Mensagem não enviada via STOMP:", destination, body);
    }
  }
}