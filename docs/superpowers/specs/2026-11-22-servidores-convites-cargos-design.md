# Servidores: convites por link, cargos personalizados e personalização

Data: 2026-11-22 · Status: aprovado

## Por quê

Hoje cada conta nova ganha um servidor próprio e não há como trazer outra pessoa para ele — por isso duas contas
nunca se encontram na mesma call ou chat. O objetivo é o ChatterHub funcionar "bem parecido com o Discord":
servidores criados de propósito, gente entrando por convite, o dono organizando cargos e o servidor do seu jeito.

## O que já existe (não refazer)

- Chat de texto em tempo real via STOMP (`/topic/channels/{id}`), sem recarregar a página.
- Voz, câmera e transmissão de tela (navegador e app desktop).
- Criar canais de texto e voz (`create-channel-modal`).
- `Role` global (ADMIN/MODERATOR/MEMBER) no `User` — continua só como administração do app; **não** dá poder
  dentro dos servidores.

## Metas

1. **Conta nova sem servidor.** Remover a criação automática em `server.service.ts` (Front). Quem não tem servidor
   vê uma tela vazia com "Criar servidor" e a dica de que dá para entrar por convite.
2. **Convites por link** (decisão do usuário: código próprio, não o ID do servidor).
3. **Cargos personalizados por servidor**, criados e atribuídos pelo dono e por quem tiver a permissão
   `MANAGE_ROLES` que o dono conceder (decisão do usuário).
4. **Personalização do servidor e dos canais**, no estilo do Discord.

## Não-metas

- Permissões por canal (sobrescritas por canal/cargo), canais privados, categorias aninhadas com permissão própria.
- Upload de arquivos para o servidor de mídia: ícone/banner seguem o mesmo esquema do avatar atual (URL/data URL).
- Banimento, logs de auditoria, convites com limite de usos configurável na UI.

## Anti-metas (seria falha mesmo funcionando)

- Alguém entrar num servidor sem convite válido (o `POST /servers/{id}/join` atual permite isso — será removido).
- Alguém com `MANAGE_ROLES` se promover: mexer em cargo igual/acima do seu, ou dar permissão que não tem.
- Checagem de permissão só no Front: **toda** permissão é validada na API (REST e STOMP).

## Abordagens consideradas

| Tema | Opções | Escolha |
|---|---|---|
| Convite | (a) código aleatório em tabela própria, revogável e com validade · (b) link com o ID do servidor | **(a)** — escolha do usuário; (b) não revoga e mantém o buraco atual |
| Cargos | (a) fixos (Dono/Admin/Mod/Membro) · (b) personalizados pelo dono | **(b)** — escolha do usuário |
| Guardar permissões | (a) bitmask `long` no cargo · (b) tabela cargo×permissão | **(a)** — decisão técnica: uma coluna, soma de cargos é um OR, fácil de testar |

## Desenho

### 1. Convites

- Entidade `ServerInvite`: `id`, `code` (8 chars base62, único), `serverId`, `createdBy`, `createdAt`,
  `expiresAt` (padrão +7 dias), `maxUses` (null = ilimitado), `uses`, `revoked`.
- REST:
  - `POST /api/servers/{id}/invites` — exige permissão `CREATE_INVITE`. Retorna `{code, url, expiresAt}`.
  - `GET /api/invites/{code}` — **público** (sem login): nome, ícone, banner, descrição, nº de membros. 404 se
    inválido/expirado/revogado.
  - `POST /api/invites/{code}/accept` — logado; entra no servidor (idempotente: se já for membro, só retorna o
    servidor). Incrementa `uses`.
  - `GET /api/servers/{id}/invites` e `DELETE /api/invites/{code}` — dono ou `MANAGE_SERVER`.
  - Remover `POST /api/servers/{id}/join`.
- Front: rota `/convite/:code`. Mostra o cartão do servidor e "Entrar". Sem login → vai para o login/cadastro e
  volta ao convite depois (código guardado em `sessionStorage`). Botão "Convidar pessoas" no cabeçalho da lista de
  canais → modal com o link e "Copiar".

### 2. Cargos

- Entidade `ServerRole`: `id`, `serverId`, `name` (1–32), `color` (hex), `permissions` (long), `position` (ordem de
  exibição), `createdAt`.
- `ServerMemberRole`: `memberId` × `roleId` (vários cargos por membro).
- Permissões (enum com bit): `CREATE_INVITE`, `MANAGE_CHANNELS`, `MANAGE_SERVER`, `MANAGE_MESSAGES`,
  `KICK_MEMBERS`, `MUTE_MEMBERS` (silenciar/desconectar na voz), `STREAM` (transmitir tela/câmera),
  `MANAGE_ROLES` (criar, renomear, apagar e atribuir cargos).
- Permissões padrão de quem não tem cargo ("@todos", guardado no próprio `Server.defaultPermissions`):
  `CREATE_INVITE | STREAM`. O dono pode mudar.
- Efetivo = dono ? tudo : `defaultPermissions | OR(cargos do membro)`. Um serviço `PermissionService.require(
  serverId, userId, perm)` usado por todos os pontos abaixo.
- Gerenciar cargos (criar/editar/apagar/atribuir/remover): dono ou `MANAGE_ROLES`, com **hierarquia** por
  `position` (maior = mais alto). Quem não é dono só pode: mexer em cargos com `position` **abaixo** do seu cargo
  mais alto; atribuir/remover esses cargos; reordenar só abaixo de si; e só pôr num cargo permissões que ele mesmo
  tem. Mudar `defaultPermissions`: só o dono. Expulsar também respeita a hierarquia (não expulsa igual/acima).
- Onde a permissão é aplicada:
  - criar/editar/apagar/reordenar canal → `MANAGE_CHANNELS`
  - editar servidor, listar/revogar convites → `MANAGE_SERVER`
  - apagar mensagem de outro → `MANAGE_MESSAGES`
  - expulsar → `KICK_MEMBERS` (nunca o dono)
  - silenciar/desconectar alguém na voz → `MUTE_MEMBERS` (nova mensagem STOMP `voice.moderate`)
  - publicar tela/câmera → `STREAM` (validado no `voice.state` e no token do SFU)
- REST: `GET/POST /api/servers/{id}/roles`, `PUT/DELETE /api/servers/{id}/roles/{roleId}`,
  `PUT /api/servers/{id}/members/{userId}/roles` (lista de ids), `DELETE /api/servers/{id}/members/{userId}` (expulsar),
  `GET /api/servers/{id}/me/permissions`.
- Front: aba "Cargos" nas configurações do servidor (lista, nome, cor, checkboxes de permissão — desabilitadas as que a
  pessoa não pode conceder; lista arrastável); membros com nome na cor do cargo mais alto e menu "Cargos…" para
  quem tem `MANAGE_ROLES`. Botões escondidos quando falta permissão.
- Mudanças de cargo/membros são publicadas em `/topic/servers/{id}/events` para atualizar quem está online.

### 3. Personalização

- `Server` ganha: `bannerUrl`, `description` (até 300), `accentColor`, `systemChannelId` (canal onde aparece
  "fulano entrou no servidor").
- `PUT /api/servers/{id}` (nome, ícone, banner, descrição, cor, canal de sistema) → `MANAGE_SERVER`.
- Canais: `Channel` ganha `topic` (até 200), `position`, `category` (texto livre opcional, agrupa na barra lateral)
  e o tipo `ANNOUNCEMENT` (só quem tem `MANAGE_MESSAGES` escreve). `PUT /api/channels/{id}`,
  `DELETE /api/channels/{id}`, `PUT /api/servers/{id}/channels/order`.
- Front: modal "Configurações do servidor" com abas **Visão geral** (nome, ícone, banner, descrição, cor, canal de
  sistema), **Cargos**, **Membros**, **Convites**; menu de contexto do canal (editar, apagar); arrastar para reordenar.
- Mensagem de sistema ao entrar por convite, no `systemChannelId` (se definido).

## Ordem de entrega

1. Conta sem servidor + convites (com `CREATE_INVITE` liberado a todos até existir a parte 2).
2. Cargos e permissões, aplicando nas rotas existentes.
3. Personalização do servidor e dos canais.

Cada parte termina com testes de API (`mvn test`) e checagem no navegador com duas contas.

## Decisões minhas (para revisar)

- Validade padrão do convite 7 dias, usos ilimitados; sem UI para mudar isso.
- Cor nos cargos; vários cargos por pessoa somando permissões.
- `CREATE_INVITE` e `STREAM` liberados para todos por padrão.
- Cargo global ADMIN não dá poder dentro dos servidores.
- Dono não pode sair nem ser expulso; transferência de dono fica fora.
- Banco: `ddl-auto` já cria/atualiza colunas (dev `create-drop`, prod `update`); colunas novas com padrão seguro.

## Para quem for construir decidir

- Layout exato dos modais (seguir o estilo atual Tailwind/`ch-*`).
- Formato do código de convite e do componente de cor.
