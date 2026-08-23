# ChatterHub — Front-end (Angular + Tailwind CSS)

Interface completa do ChatterHub, uma plataforma de comunicação moderna construída com **Standalone Components**, **Signals** para
gerenciamento de estado e **Tailwind CSS** para 100% do styling. Preparada para consumir uma API Java (Spring Boot) via REST + WebSocket/STOMP (chat) e WebRTC (voz/vídeo).

## Rodando o projeto

```bash
npm install
npm start
```

Acesse `http://localhost:4200`.

## Estrutura

```
src/app/
├── models/            # Interfaces TypeScript (Server, Channel, User, Message)
├── mock-data.ts        # Dados falsos para desenvolvimento sem backend
├── services/            # Estado global via Signals (ServerService, ChannelService,
│                         # UserService, ChatService, VoiceService)
├── layout/
│   ├── server-sidebar/  # Coluna 1 — ícones de servidores
│   ├── server-icon/     # Ícone individual (pílula ativa + hover rounded-2xl)
│   ├── channel-sidebar/ # Coluna 2 — canais de texto/voz + user-controls
│   ├── user-controls/   # Avatar do usuário + mutar/silenciar/config
│   └── main-area/        # Coluna 3 — alterna entre chat de texto e sala de voz
├── chat/
│   ├── text-chat/        # Área de mensagens com scroll
│   ├── message/          # Bolha de mensagem individual
│   └── chat-input/       # Barra de digitação
└── voice/
    ├── voice-room/        # Sala de voz + controles de chamada
    ├── voice-grid/        # Grid de participantes (com layout de tela compartilhada)
    └── user-card/         # Card de participante com glow verde ao falar
```

## Pontos de integração futura (buscar por "TODO" no código)

- `services/chat.service.ts` → conectar em WebSocket/STOMP para mensagens em tempo real.
- `services/voice.service.ts` e `voice-room.component.ts` → sinalização WebRTC via STOMP
  e `getDisplayMedia()` para compartilhamento de tela real.
- `services/server.service.ts`, `channel.service.ts`, `user.service.ts` → substituir os
  signals mockados por chamadas HTTP para a API Spring Boot.

## Paleta (tailwind.config.js)

| Token | Uso |
|---|---|
| `ch-bg-deep` (#0a0e17) | Fundo mais profundo |
| `ch-bg-darker` (#0f141f) | Barra de servidores |
| `ch-bg-dark` (#1a1f2e) | Barra de canais |
| `ch-bg-medium` (#232a3d) | Área de chat principal |
| `ch-brand` (#4f8df5) | Cor de destaque (azul) |
| `ch-accent` (#00d4ff) | Cor de destaque secundária (ciano) |
| `ch-success` (#10b981) | Status online / usuário falando |
