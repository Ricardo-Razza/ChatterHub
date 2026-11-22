# Razzacord

Chat com canais de texto e voz, chamadas por WebRTC e transmissão de tela.

- `Razzacord - API` — Spring Boot 3 (JWT, STOMP/WebSocket, sinalização de voz)
- `Razzacord - Front` — Angular 17
- `Razzacord - Desktop` — app Electron (seletor de tela, áudio por aplicativo, push-to-talk global)

## Rodando em desenvolvimento

```bash
# API (H2 em memória, JWT de desenvolvimento) — requer JDK 17+
cd "Razzacord - API" && mvn spring-boot:run

# Front (http://localhost:4200)
cd "Razzacord - Front" && npm install && npm start

# Desktop (opcional) apontando para o front local
cd "Razzacord - Desktop" && npm install && npm run dev
```

A primeira conta criada vira **ADMIN**; as demais são MEMBER.

## Produção

```bash
cp .env.example .env     # preencha JWT_SECRET, senhas, TURN_SECRET, CORS_ALLOWED_ORIGINS...
docker compose up -d --build
```

Sobe MySQL (rede interna, sem porta exposta), API (`prod`), front/nginx na porta 3001 e o **coturn**.
Coloque um proxy com TLS (HTTPS é obrigatório para microfone/câmera fora de `localhost`) na frente da porta 3001
e libere no firewall `3478/tcp+udp` e `49160-49200/udp` para o TURN.

Variáveis obrigatórias: `JWT_SECRET` (>= 32 caracteres), `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `CORS_ALLOWED_ORIGINS`, `TURN_SECRET`.

## Como a voz funciona

- **Sinalização**: o cliente envia `/app/voice.join|leave|state|signal`. A identidade vem do JWT (nunca do payload).
  O servidor mantém quem está em cada sala (`VoiceRoomRegistry`) e publica a lista em `/topic/voice/{canal}`;
  offers/answers/ICE vão **só** para o destinatário em `/user/queue/voice`. Queda de conexão tem uma janela de graça (8 s)
  antes de remover o participante, então um soluço de rede não derruba as conexões WebRTC.
- **Autorização STOMP**: o `CONNECT` exige JWT válido; só membros assinam tópicos do seu canal; clientes não podem
  publicar direto em `/topic/**`.
- **WebRTC**: negociação "perfect negotiation", transceivers fixos (ligar câmera/tela é `replaceTrack`, sem renegociar),
  reinício de ICE em falha, STUN/TURN entregues por `GET /api/voice/ice-servers` (credenciais TURN temporárias).
- **Microfone**: noise gate, mute e push-to-talk rodam num AudioWorklet (continua funcionando com a janela em segundo plano).
- **Tela**: qualidade e prioridade (fluidez/nitidez) configuráveis; o bitrate é dividido entre os espectadores.
- A chamada permanece ativa enquanto você navega pelos canais de texto.

### Transmissão de tela sem a call

- **App desktop (Windows 10 2004+)**: você escolhe a janela/tela e **de qual aplicativo sai o áudio**. Só o áudio desse
  processo (e filhos) é capturado via WASAPI *process loopback* — Discord, a call do Razzacord e o resto do sistema ficam de fora.
  Usa os binários do pacote `application-loopback` (exemplo oficial da Microsoft empacotado), fixado na versão 1.2.7.
- **Navegador**: o áudio vem apenas da aba compartilhada (`systemAudio: "exclude"`, `suppressLocalAudioPlayback`).

## Testes

```bash
cd "Razzacord - API" && mvn test          # unitários + integração STOMP (auth, presença, relay de sinais)

# Ponta a ponta com Chrome real e WebRTC (API em :8080 e front em :4200 rodando)
cd e2e && npm install
npm run voice      # 2 usuários: presença, áudio, câmera, tela, navegação, queda de rede, permissões REST
npm run desktop    # app Electron + Chrome: seletor de tela e transmissão
```

## SFU (LiveKit) — salas maiores

Por padrão a mídia vai em malha P2P. Para escalar, configure `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`
na API e suba o servidor com `docker compose --profile sfu up -d` (ou rode o binário do LiveKit). A API emite o token
em `GET /api/voice/sfu?channelId=` (404 sem SFU). O cliente tenta o SFU primeiro e cai na malha P2P se ele estiver indisponível.
Cada pessoa envia UMA vez ao servidor, então transmitir a tela deixa de custar um upload por espectador.
A presença, o mute e os avisos continuam pela sinalização própria.

## Limites conhecidos

- Sem SFU configurado a topologia é **malha (P2P)**: cada espectador custa um upload completo de quem transmite
  (até ~4-6 pessoas). Acima disso, ative o SFU (seção acima).
- Áudio por aplicativo só em Windows; macOS/Linux transmitem tela sem áudio.
- Push-to-talk global usa `uiohook-napi` (dependência opcional). Sem ele o push-to-talk só funciona com a janela em foco.
- Sem auto-update nem assinatura de código no instalador do Electron.
- Rate limit de login e presença de voz são em memória (uma instância da API).
