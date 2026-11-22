# Parte 2 — Cargos e permissões: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargos personalizados por servidor, com permissões em bitmask, hierarquia por `position` e checagem na API (REST e STOMP), mais as telas para o dono e quem tem `MANAGE_ROLES` gerenciarem tudo.

**Architecture:** Um `PermissionService` central calcula a permissão efetiva (dono = tudo; senão `defaultPermissions | OR(cargos)`) e a posição mais alta de cada membro; todo ponto que hoje checa "dono ou ADMIN global" passa a chamar `permissionService.require(...)`. Um `RoleService` concentra criar/editar/apagar/reordenar/atribuir com as regras de hierarquia e publica eventos em `/topic/servers/{id}/events`. No Front, um `PermissionService` (signals) guarda as permissões do servidor ativo e um modal "Configurações do servidor" ganha as abas Cargos e Membros.

**Tech Stack:** Spring Boot 3.2 (JPA, Security/JWT, STOMP), H2 em dev / MySQL em prod, JUnit 5 + `@SpringBootTest`; Angular 17 standalone + signals + Tailwind `ch-*` + lucide.

**Spec:** `docs/superpowers/specs/2026-11-22-servidores-convites-cargos-design.md` (seção "2. Cargos"; "Anti-metas"; "Decisões minhas").

Caminhos: API = `Razzacord - API/src/main/java/com/api/Razzacord/` (abaixo `API/`), testes = `Razzacord - API/src/test/java/com/api/Razzacord/` (abaixo `TEST/`), Front = `Razzacord - Front/src/app/` (abaixo `FRONT/`).

Comando de teste da API (na pasta `Razzacord - API`): `C:\Users\razza\.m2\wrapper\dists\apache-maven-3.9.16\56ba1f9f\bin\mvn.cmd -q test` (filtrar com `-Dtest=Classe`). Build do Front (na pasta `Razzacord - Front`): `npx ng build`.

## Global Constraints

- Permissões (enum `Permission`, bit fixo — não mudar a ordem): `CREATE_INVITE=1`, `MANAGE_CHANNELS=2`, `MANAGE_SERVER=4`, `MANAGE_MESSAGES=8`, `KICK_MEMBERS=16`, `MUTE_MEMBERS=32`, `STREAM=64`, `MANAGE_ROLES=128`.
- `Server.defaultPermissions` padrão = `CREATE_INVITE | STREAM` = `65`; coluna `BIGINT DEFAULT 65 NOT NULL` (prod usa `ddl-auto=update` com linhas existentes).
- Efetivo = dono ? todas (`255`) : `defaultPermissions | OR(permissions dos cargos do membro)`. Não-membro = `0`.
- "Posição do topo" (`topPosition`) de um membro = maior `position` entre seus cargos; `0` se nenhum; dono = `Integer.MAX_VALUE`.
- Hierarquia para quem não é dono: só mexe em cargo com `position < topPosition` próprio; só atribui/remove esses cargos; só põe num cargo permissões que ele mesmo tem; só age (cargos/expulsar/moderar voz) sobre membro cujo `topPosition` é menor que o seu; nunca sobre o dono.
- `defaultPermissions` só o dono muda.
- Cargo: `name` 1–32 caracteres (trim), `color` `#RRGGBB` (padrão `#99AAB5`), no máximo 50 cargos por servidor.
- `Role` global (ADMIN/MODERATOR) **não** dá poder dentro de servidores — remover esses atalhos de `ChannelController` e `MessageService`.
- Dono não sai nem é expulso.
- Mensagens de erro em português, via `ApiException` (403 sem permissão, 400 entrada inválida, 404 inexistente).
- Toda permissão é validada na API; o Front só esconde botões.
- Front: seguir o estilo atual (Tailwind `ch-*`, componentes standalone, signals, ícones lucide).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Não fazer push.

## Review Focus

1. Membro com `MANAGE_ROLES` tentando se dar um cargo acima/igual ao seu ou editar o próprio cargo mais alto para ganhar permissão → 403 (teste na Task 2).
2. Reordenação enviada por não-dono que move um cargo acima dele (ou o próprio) → 403, nada muda (teste na Task 2).
3. Cliente sem `STREAM` mandando `voice.state` com `isSharingScreen: true` → o servidor ignora essas chaves e o roster continua `false` (teste na Task 4).
4. Servidor já existente em prod sem a coluna nova → sobe com `defaultPermissions = 65` (coberto pela `columnDefinition`, conferido na Task 1).
5. Membro expulso com a página aberta → some o servidor da lista dele e ele perde acesso aos tópicos (teste de API na Task 3; conferência no navegador na Task 7).

---

### Task 1: Modelo de cargos e `PermissionService`

**Files:**
- Create: `API/model/Permission.java`, `API/model/ServerRole.java`, `API/model/ServerMemberRole.java`, `API/repository/ServerRoleRepository.java`, `API/repository/ServerMemberRoleRepository.java`, `API/security/PermissionService.java`
- Modify: `API/model/Server.java` (campo `defaultPermissions`)
- Test: `TEST/PermissionServiceTest.java`

**Interfaces:**
- Produces:
  - `enum Permission { CREATE_INVITE(1), …, MANAGE_ROLES(128); long bit(); static final long ALL = 255; static long of(Permission... p); static boolean has(long mask, Permission p) }`
  - `ServerRole { UUID id; UUID serverId; String name; String color; long permissions; int position; LocalDateTime createdAt }` (tabela `server_roles`)
  - `ServerMemberRole { UUID id; UUID serverId; UUID userId; UUID roleId }` (tabela `server_member_roles`, único `(user_id, role_id)`; guarda `serverId+userId` em vez de `memberId` para casar com `ServerMember`, que não é referenciado por id em lugar nenhum)
  - `ServerRoleRepository`: `findByServerIdOrderByPositionDesc(UUID)`, `countByServerId(UUID)`, `deleteByServerId(UUID)`
  - `ServerMemberRoleRepository`: `findByServerIdAndUserId(UUID, UUID)`, `findByServerId(UUID)`, `deleteByRoleId(UUID)`, `deleteByServerIdAndUserId(UUID, UUID)`, `deleteByServerId(UUID)`
  - `PermissionService`:
    - `long effective(UUID serverId, UUID userId)`
    - `boolean has(UUID serverId, UUID userId, Permission p)`
    - `void require(UUID serverId, UUID userId, Permission p)` → `ApiException.forbidden("Você não tem permissão para isso")`; não-membro → `forbidden("Você não é membro deste servidor")`; servidor inexistente → `notFound("Servidor não encontrado")`
    - `int topPosition(UUID serverId, UUID userId)`
    - `boolean isOwner(UUID serverId, UUID userId)`

- [ ] **Step 1: Testes que falham** em `PermissionServiceTest` (`@SpringBootTest`, `@Transactional`, cria usuários/servidores direto pelos repositórios):
  - `ownerHasAll`: `effective(server, owner) == 255`.
  - `memberWithoutRolesGetsDefault`: `== 65`; `has(..., STREAM)` true, `has(..., MANAGE_CHANNELS)` false.
  - `rolesAreOred`: cargos com `MANAGE_CHANNELS` e `KICK_MEMBERS` → `65 | 2 | 16`.
  - `nonMemberGetsZero` e `require` lança 403 com "Você não é membro deste servidor".
  - `requireMissingPermissionThrows403`.
  - `topPosition`: sem cargo `0`; cargos nas posições 2 e 5 → `5`; dono → `Integer.MAX_VALUE`.
  - `defaultPermissionsChangeApplies`: `server.setDefaultPermissions(0)` → membro sem cargo tem `0`.
- [ ] **Step 2:** `mvn -q test -Dtest=PermissionServiceTest` → FAIL (classes não existem).
- [ ] **Step 3:** Implementar os arquivos acima. `Server.defaultPermissions`: `@Builder.Default @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 65 NOT NULL") private long defaultPermissions = 65;`.
- [ ] **Step 4:** `mvn -q test` → todos passam (os 29 antigos inclusos).
- [ ] **Step 5:** Commit `feat(api): modelo de cargos e serviço de permissões`.

### Task 2: API de cargos (`RoleService` + rotas)

**Files:**
- Create: `API/service/RoleService.java`, `API/controller/RoleController.java`, `API/dto/ServerRoleRequest.java`, `API/dto/ServerRoleResponse.java`, `API/dto/MemberResponse.java`, `API/dto/MyPermissionsResponse.java` (não reutilizar `dto/RoleRequest.java`: é do cargo global)
- Modify: `API/service/ServerService.java` (`getServerMembers` devolve `MemberResponse`; `deleteServer` apaga cargos e vínculos), `API/controller/ServerController.java`, `API/config/StompAuthInterceptor.java` (liberar `/topic/servers/{id}/events` só para membros)
- Test: `TEST/RoleControllerTest.java` (mesmo estilo de `InviteControllerTest`: `RANDOM_PORT`, `TestRestTemplate`, helpers `token`, `call`, `createServer`; para pôr alguém no servidor, criar convite e aceitar)

**Interfaces:**
- Consumes: Task 1.
- Produces (REST, todas logadas):
  - `GET /api/servers/{id}/roles` (membro) → `List<ServerRoleResponse{id, name, color, permissions, position}>`, ordem `position` desc.
  - `POST /api/servers/{id}/roles` body `ServerRoleRequest{name, color, permissions}` → `ServerRoleResponse`. Exige `MANAGE_ROLES`. Posição: dono → `max+1`; outro → `p = topPosition(ator)`, e todos os cargos com `position >= p` sobem `+1` (o novo fica logo abaixo do topo do ator).
  - `PUT /api/servers/{id}/roles/{roleId}` body `ServerRoleRequest` (campos nulos = não muda) → `ServerRoleResponse`.
  - `DELETE /api/servers/{id}/roles/{roleId}` → 204; apaga os vínculos do cargo.
  - `PUT /api/servers/{id}/roles/order` body `{"roleIds": [...]}` (todos os cargos, do mais alto ao mais baixo) → lista nova. Reatribui `position = N..1`. Não-dono: todo cargo com `position >= topPosition(ator)` deve ficar com a mesma posição, senão 403.
  - `PUT /api/servers/{id}/members/{userId}/roles` body `{"roleIds": [...]}` → `MemberResponse`. Cada cargo **adicionado ou removido** deve ter `position < topPosition(ator)`; cargos acima do ator que o alvo já tem são mantidos como estão.
  - `PUT /api/servers/{id}/default-permissions` body `{"permissions": n}` → 204. Só o dono.
  - `GET /api/servers/{id}/me/permissions` → `MyPermissionsResponse{permissions, owner, topPosition}`.
  - `GET /api/servers/{id}/members` passa a devolver `List<MemberResponse{id, username, avatarUrl, status, owner, roleIds}>`.
- Regras comuns de escrita (`RoleService`): exige `MANAGE_ROLES`; não-dono só toca cargo com `position < topPosition`; `permissions` pedidas `& ~effective(ator)` deve ser `0`; não-dono só altera membro alvo com `topPosition(alvo) < topPosition(ator)` e nunca o dono; validações do nome/cor/limite 50 dos Global Constraints; `permissions` fora de `0..255` → 400; cargo de outro servidor → 404 "Cargo não encontrado".
- Eventos (via `SimpMessagingTemplate`, `/topic/servers/{id}/events`): `{"type":"roles"}` após criar/editar/apagar/reordenar/default-permissions; `{"type":"member-roles","userId":…}` após atribuir.

- [ ] **Step 1: Testes que falham** em `RoleControllerTest`:
  - `ownerCreatesListsUpdatesDeletesRole` (cria "Mod" cor `#FF0000` perms `2`, lista, renomeia, apaga → 204 e some da lista).
  - `memberWithoutManageRolesGets403`.
  - `invalidNameOrColorGets400` (nome vazio, 33 chars, cor `red`).
  - `managerCannotGrantPermissionHeLacks` (gerente com `MANAGE_ROLES` só cria cargo com `KICK_MEMBERS` → 403).
  - `managerCannotTouchRoleAtOrAboveHisTop` (editar o próprio cargo → 403; editar cargo acima → 403; cargo abaixo → 200).
  - `managerCannotAssignHisOwnOrHigherRole` (atribuir a si mesmo ou a outro o cargo do topo dele → 403).
  - `managerCannotChangeRolesOfEqualOrHigherMemberOrOwner` → 403.
  - `managerCreatedRoleLandsJustBelowHim` (posição do novo < topo do gerente e > cargos abaixo).
  - `reorderByManagerMovingRoleAboveHimIs403AndNothingChanges`.
  - `onlyOwnerChangesDefaultPermissions` (gerente → 403; dono → 204 e `me/permissions` de membro reflete).
  - `myPermissionsReflectsRoles` e `membersListIncludesRoleIdsAndOwnerFlag`.
- [ ] **Step 2:** `mvn -q test -Dtest=RoleControllerTest` → FAIL.
- [ ] **Step 3:** Implementar `RoleService`, `RoleController`, DTOs, mudanças em `ServerService`/`ServerController`, e no `StompAuthInterceptor` o padrão `^/topic/servers/{UUID}/events$` com checagem de membro (igual ao `SERVER_VOICE_TOPIC`).
- [ ] **Step 4:** `mvn -q test` → tudo passa.
- [ ] **Step 5:** Commit `feat(api): rotas de cargos com hierarquia`.

### Task 3: Aplicar permissões nas rotas existentes + expulsar

**Files:**
- Modify: `API/controller/ChannelController.java` (criar/apagar canal → `MANAGE_CHANNELS`), `API/service/InviteService.java` (criar → `CREATE_INVITE`; listar/revogar → `MANAGE_SERVER`, trocar `requireOwner`), `API/service/MessageService.java` (apagar de outro → `MANAGE_MESSAGES`), `API/security/AccessService.java` (remover `canModerate`, `requireServerOwnerOrAdmin`, `isPrivileged` se ficarem sem uso), `API/service/ServerService.java` (`kick`), `API/controller/ServerController.java`
- Test: `TEST/PermissionEnforcementTest.java`; ajustar `TEST/InviteControllerTest.java` / `InviteServiceTest.java` se algum caso dependia de "só dono"

**Interfaces:**
- Consumes: `PermissionService.require/has/topPosition/isOwner` (Task 1); eventos (Task 2).
- Produces: `DELETE /api/servers/{id}/members/{userId}` → 204. Exige `KICK_MEMBERS`; alvo ≠ dono, ≠ ele mesmo, `topPosition(alvo) < topPosition(ator)` (dono do servidor passa sempre). Remove `ServerMember` e vínculos de cargo, tira o alvo de sala de voz do servidor se estiver (`VoiceRoomRegistry.leave` + broadcast do roster — se isso exigir expor o broadcast, criar `VoiceWsController.kickFromVoice(UUID userId)` público), e publica `{"type":"member-removed","userId":…}`.

- [ ] **Step 1: Testes que falham** em `PermissionEnforcementTest`:
  - `channelCreateNeedsManageChannels` (membro comum 403; com cargo `MANAGE_CHANNELS` 200).
  - `globalAdminRoleGivesNoServerPower` (usuário com `Role.ADMIN` global e não dono → 403 ao criar canal).
  - `inviteCreateFollowsDefaultPermissions` (dono põe `defaultPermissions=0` → membro comum 403 ao criar convite).
  - `listAndRevokeInvitesNeedManageServer`.
  - `deleteOthersMessageNeedsManageMessages` (autor pode apagar a própria sempre).
  - `kick`: sem permissão 403; expulsar dono 403; expulsar igual/acima 403; caso válido 204, alvo some de `/members` e recebe 403 em `GET /api/servers/{id}/channels`.
- [ ] **Step 2:** `mvn -q test -Dtest=PermissionEnforcementTest` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `mvn -q test` → tudo passa.
- [ ] **Step 5:** Commit `feat(api): aplica permissões de cargo e expulsão`.

### Task 4: Voz — `STREAM` e `MUTE_MEMBERS`

**Files:**
- Modify: `API/controller/VoiceWsController.java`, `API/voice/VoiceMessages.java` (nova classe `Moderate { UUID channelId; UUID targetId; String action; }`), `API/voice/LiveKitTokenService.java`, `API/controller/VoiceController.java`
- Test: `TEST/VoiceSignalingTest.java` (estender; já sabe conectar STOMP com dois usuários) e `TEST/VoiceUnitTests.java` (token)

**Interfaces:**
- Consumes: `PermissionService` (Task 1); `channel.getServerId()` para achar o servidor.
- Produces:
  - `voice.join` e `voice.state`: sem `STREAM`, as chaves `isCameraOn`, `isSharingScreen`, `cameraStreamId`, `screenStreamId` são removidas do estado recebido antes de `registry.join/updateState`.
  - `LiveKitTokenService.tokenFor(String room, String identity, String name, boolean canStream)`: com `canStream=false` o grant ganha `"canPublishSources": ["microphone"]`; com `true`, sem essa chave (comportamento atual).
  - `@MessageMapping("/voice.moderate")` com `Moderate{channelId, targetId, action}` (`action` ∈ `mute`, `disconnect`): exige `MUTE_MEMBERS` no servidor do canal, alvo na sala, alvo ≠ dono, `topPosition(alvo) < topPosition(ator)`; senão ignora em silêncio (padrão dos outros handlers STOMP). `mute` → `registry.updateState(canal, alvo, {isMuted:true})`, broadcast do roster e `convertAndSendToUser(alvo, "/queue/voice", {type:"moderate", action:"mute", channelId})`. `disconnect` → `registry.leave(alvo)`, broadcast e `{type:"moderate", action:"disconnect", channelId}` ao alvo.

- [ ] **Step 1: Testes que falham:**
  - `stateWithoutStreamStripsScreenAndCamera` (defaultPermissions=1; membro manda `isSharingScreen:true` → roster mostra `false`/ausente).
  - `moderateMuteByAuthorizedMemberMutesTarget` (roster do alvo `isMuted:true` e alvo recebe `/user/queue/voice` `moderate`).
  - `moderateWithoutPermissionIsIgnored`.
  - `moderateDisconnectRemovesTargetFromRoster`.
  - Em `VoiceUnitTests`: `tokenWithoutStreamLimitsSourcesToMicrophone`.
- [ ] **Step 2:** `mvn -q test -Dtest=VoiceSignalingTest,VoiceUnitTests` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `mvn -q test` → tudo passa.
- [ ] **Step 5:** Commit `feat(api): permissões de transmissão e moderação de voz`.

### Task 5: Front — serviços de permissão e cargos

**Files:**
- Create: `FRONT/models/role.model.ts`, `FRONT/services/permission.service.ts`, `FRONT/services/role.service.ts`
- Modify: `FRONT/services/server.service.ts` (`kickMember`)

**Interfaces:**
- Consumes: rotas das Tasks 2–3.
- Produces:
  - `role.model.ts`: `export const PERM = { CREATE_INVITE: 1, MANAGE_CHANNELS: 2, MANAGE_SERVER: 4, MANAGE_MESSAGES: 8, KICK_MEMBERS: 16, MUTE_MEMBERS: 32, STREAM: 64, MANAGE_ROLES: 128 } as const;` `export const PERM_LABELS` (rótulos pt-BR: "Criar convites", "Gerenciar canais", "Gerenciar servidor", "Gerenciar mensagens", "Expulsar membros", "Silenciar membros", "Transmitir tela/câmera", "Gerenciar cargos"); `interface ServerRole {id,name,color,permissions,position}`; `interface ServerMember {id,username,avatarUrl,status,owner,roleIds}`.
  - `PermissionService`: signals `permissions`, `isOwner`, `topPosition` do servidor ativo (recarrega quando `ServerService.activeServerId` muda e ao receber eventos `roles`/`member-roles` do próprio usuário); `can(bit: number): boolean`.
  - `RoleService`: signals `roles` e `members` do servidor ativo; `load()`, `create(req)`, `update(id, req)`, `remove(id)`, `reorder(ids)`, `setMemberRoles(userId, ids)`, `setDefaultPermissions(n)`; `colorFor(userId): string | null` (cor do cargo de maior posição); assina `/topic/servers/{id}/events` e recarrega em `roles`/`member-roles`; em `member-removed` do próprio usuário chama `ServerService.loadServers()` e mostra toast "Você foi removido do servidor".
- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npx ng build` → sem erros.
- [ ] **Step 3:** Commit `feat(front): serviços de cargos e permissões`.

### Task 6: Front — modal "Configurações do servidor" (Cargos e Membros)

**Files:**
- Create: `FRONT/layout/server-settings-modal/server-settings-modal.component.{ts,html}`
- Modify: `FRONT/layout/channel-sidebar/channel-sidebar.component.{ts,html}` (botão engrenagem no cabeçalho, visível se `isOwner` ou `can(MANAGE_ROLES|KICK_MEMBERS)`)

**Interfaces:**
- Consumes: Task 5.
- Comportamento:
  - Aba **Cargos**: lista à esquerda (cor + nome, do mais alto ao mais baixo, botões ↑/↓ para reordenar — sem arrastar, para não adicionar `@angular/cdk`), "Criar cargo"; à direita nome, cor (`<input type="color">`) e checkboxes de `PERM_LABELS`. Checkbox desabilitada quando a pessoa não tem aquela permissão; cargo inteiro somente-leitura quando `position >= topPosition`. Item "@todos" no fim da lista edita `defaultPermissions` (só o dono). Erros da API viram toast.
  - Aba **Membros**: lista com avatar e nome na cor do cargo; por membro, chips dos cargos e um menu "Cargos…" com checkboxes (desabilitadas para cargos `>= topPosition`), botão "Expulsar" (se `can(KICK_MEMBERS)`, alvo não-dono e abaixo de si) com confirmação.
- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npx ng build` → sem erros.
- [ ] **Step 3:** Commit `feat(front): configurações do servidor com cargos e membros`.

### Task 7: Front — esconder ações sem permissão, cores e moderação de voz + checagem no navegador

**Files:**
- Modify: `FRONT/layout/channel-sidebar/*` (botões "+" de canal só com `MANAGE_CHANNELS`; convidar só com `CREATE_INVITE`), `FRONT/chat/message/message.component.{ts,html}` (`canDelete = isOwn || can(MANAGE_MESSAGES)`; nome do autor com `colorFor(authorId)`), `FRONT/services/voice.service.ts` (tratar `{type:"moderate"}` em `/user/queue/voice`: `mute` → silencia o microfone local; `disconnect` → sai da sala; toast em ambos; botões de tela/câmera desabilitados sem `STREAM`), `FRONT/voice/user-card/user-card.component.{ts,html}` (menu "Silenciar" / "Desconectar" para quem tem `MUTE_MEMBERS`, envia `/app/voice.moderate`)

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npx ng build` → sem erros; `mvn -q test` → tudo passa.
- [ ] **Step 3:** Checar no navegador com duas contas (abas separadas): dono cria cargo "Mod" com Gerenciar cargos + Expulsar; dá ao convidado; convidado vê a engrenagem, não consegue marcar permissões que não tem nem editar "Mod"; dono tira `STREAM` de @todos e o botão de tela some para o convidado; dono expulsa o convidado e o servidor some da lista dele na hora.
- [ ] **Step 4:** Commit `feat(front): aplica permissões na interface e moderação de voz`.

## Decisões minhas (para revisar)

- `ServerMemberRole` guarda `serverId+userId` (não `memberId`), pois nada no código referencia `ServerMember` por id.
- Rotas extras não nomeadas no spec: `PUT /roles/order` (reordenar) e `PUT /default-permissions`.
- Reordenar com botões ↑/↓ em vez de arrastar, para não adicionar `@angular/cdk`.
- Cargo novo de um gerente entra logo abaixo do cargo mais alto dele.
- `voice.moderate` também respeita a hierarquia (o spec só pede isso para expulsar).
- Cor padrão `#99AAB5`; limite de 50 cargos por servidor.
- Os atalhos do cargo global ADMIN/MODERATOR dentro de servidores são removidos (spec: "não dá poder dentro dos servidores").
