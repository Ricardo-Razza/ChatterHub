# Parte 1 — Conta sem servidor + convites por link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conta nova começa sem servidor e só se entra num servidor por um link de convite (`/convite/{code}`).

**Architecture:** Nova entidade `ServerInvite` com código aleatório; `InviteService` cria/consulta/aceita; o
`POST /servers/{id}/join` atual sai. No Front, uma rota `/convite/:code` com um componente que mostra o servidor e
aceita, e um modal "Convidar pessoas" que gera e copia o link.

**Tech Stack:** Spring Boot 3.2 (JPA, Spring Security, JUnit 5), Angular 17 standalone + signals, Tailwind (`ch-*`).

**Spec:** `docs/superpowers/specs/2026-11-22-servidores-convites-cargos-design.md` (seção "1. Convites" e Meta 1)

## Global Constraints

- Código do convite: 8 caracteres base62 (`[A-Za-z0-9]`), gerado com `SecureRandom`, único.
- Validade padrão: `expiresAt = createdAt + 7 dias`; `maxUses = null` (ilimitado).
- Quem cria convite nesta parte: qualquer membro do servidor (vira permissão `CREATE_INVITE` na parte 2).
- Convite inválido, expirado, revogado ou de servidor apagado → **404** "Convite inválido ou expirado".
- Aceitar sendo já membro é idempotente: 200 com o servidor, sem incrementar `uses`.
- Link exibido: `${window.location.origin}/convite/${code}` (montado no Front).
- Mensagens de erro em português, via `ApiException`.
- Trabalhar direto na branch `main` (escolha do usuário); um commit por task.

## Review Focus

1. Convite expirado ou revogado aberto por alguém → 404 limpo, sem entrar (teste em Task 1).
2. Código malformado (`../x`, 200 caracteres, vazio) → 404, nunca 500 (teste em Task 2).
3. Dono apaga o servidor → convites dele somem e o link dá 404 (teste em Task 1).
4. Quem não é membro tenta gerar convite de um servidor → 403 (teste em Task 1).
5. Usuário deslogado abre o link → vê o login e, depois de entrar, cai na tela do convite (checagem em Task 5).

---

### Task 1: `ServerInvite` + `InviteService` (API)

**Files:**
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/model/ServerInvite.java`
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/repository/ServerInviteRepository.java`
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/dto/InviteResponse.java`
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/dto/InvitePreviewResponse.java`
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/service/InviteService.java`
- Modify: `ChatterHub - API/src/main/java/com/api/ChatterHub/service/ServerService.java` (remover `joinServer`; `deleteServer` apaga convites)
- Test: `ChatterHub - API/src/test/java/com/api/ChatterHub/InviteServiceTest.java`

**Interfaces:**
- Produces:
  - `ServerInvite` (`@Entity`, tabela `server_invites`, Lombok `@Data @Builder`): `UUID id`, `String code` (unique, length 8), `UUID serverId`, `UUID createdBy`, `LocalDateTime createdAt`, `LocalDateTime expiresAt`, `Integer maxUses`, `int uses`, `boolean revoked`.
  - `ServerInviteRepository`: `Optional<ServerInvite> findByCode(String)`, `boolean existsByCode(String)`, `void deleteByServerId(UUID)`.
  - `InviteResponse { String code; LocalDateTime expiresAt; }`
  - `InvitePreviewResponse { UUID serverId; String serverName; String iconUrl; String initials; int memberCount; }`
  - `InviteService`:
    - `InviteResponse createInvite(UUID serverId)` — usuário atual; exige membro (senão `forbidden("Você não é membro deste servidor")`).
    - `InvitePreviewResponse preview(String code)`
    - `ServerResponse accept(String code)` — usuário atual.
  - `ServerService.mapToServerResponse` passa a `public` (usado pelo `accept`).

- [ ] **Step 1: Escrever `InviteServiceTest`** (`@SpringBootTest`, mesmo helper de login por `SecurityContextHolder` do `VoiceSignalingTest`):
  - `createInvite_retornaCodigoDe8CaracteresEValidade7Dias` — `code.matches("[A-Za-z0-9]{8}")`; `expiresAt` entre agora+7d−1min e agora+7d+1min.
  - `naoMembroNaoCriaConvite` — bob (sem servidor) chama `createInvite(serverDaAlice)` → `ApiException` com status 403.
  - `accept_adicionaMembroEIncrementaUsos` — bob aceita; `serverService.getServersForCurrentUser()` do bob contém o servidor; `uses == 1`.
  - `accept_jaMembroEIdempotente` — bob aceita duas vezes; segunda não lança e `uses` continua 1.
  - `conviteExpiradoDa404` — setar `expiresAt = now().minusMinutes(1)` via repositório; `accept` e `preview` → 404.
  - `conviteRevogadoDa404` — `revoked = true`; `accept` → 404.
  - `apagarServidorApagaConvites` — alice apaga o servidor; `preview(code)` → 404 e `repo.findByCode(code)` vazio.
  - `preview_mostraNomeEContagemDeMembros` — depois do bob entrar: `serverName` correto e `memberCount == 2`.
- [ ] **Step 2: Rodar e ver falhar**
  Run: `mvn -q -f "ChatterHub - API/pom.xml" test -Dtest=InviteServiceTest`
  Expected: erro de compilação (`InviteService` não existe).
- [ ] **Step 3: Criar entidade, repositório, DTOs e `InviteService`** com as assinaturas acima. Código: 8 chars de
  `SecureRandom` sobre `[A-Za-z0-9]`, repetir enquanto `existsByCode`. `preview`/`accept` usam um
  `requireUsable(code)` privado que lança `ApiException.notFound("Convite inválido ou expirado")` se não existe,
  `revoked`, `expiresAt` passado, `maxUses != null && uses >= maxUses`, ou servidor sumiu. `accept` é `@Transactional`.
- [ ] **Step 4: Em `ServerService`** remover `joinServer`; em `deleteServer` chamar `serverInviteRepository.deleteByServerId(id)` antes de apagar o servidor; `mapToServerResponse` público.
- [ ] **Step 5: Ajustar `VoiceSignalingTest`** linha ~105: trocar `serverService.joinServer(server.getId())` por
  criar o convite como alice e aceitar como o outro usuário (`inviteService.accept(invite.getCode())`).
- [ ] **Step 6: Rodar tudo**
  Run: `mvn -q -f "ChatterHub - API/pom.xml" test`
  Expected: BUILD SUCCESS, 0 falhas.
- [ ] **Step 7: Commit** — `feat(api): convites de servidor com código e validade`

### Task 2: Endpoints REST de convite (API)

**Files:**
- Create: `ChatterHub - API/src/main/java/com/api/ChatterHub/controller/InviteController.java`
- Modify: `ChatterHub - API/src/main/java/com/api/ChatterHub/controller/ServerController.java` (remover `/{id}/join`; adicionar `POST /{id}/invites`)
- Modify: `ChatterHub - API/src/main/java/com/api/ChatterHub/config/SecurityConfig.java:44` (liberar `GET /api/invites/*`)
- Modify: `e2e/voice.e2e.js:79`, `e2e/desktop.e2e.js:14` (entrar via convite)
- Test: `ChatterHub - API/src/test/java/com/api/ChatterHub/InviteControllerTest.java`

**Interfaces:**
- Consumes: `InviteService` (Task 1).
- Produces:
  - `POST /api/servers/{id}/invites` → 200 `InviteResponse`
  - `GET /api/invites/{code}` (sem login) → 200 `InvitePreviewResponse` | 404
  - `POST /api/invites/{code}/accept` → 200 `ServerResponse` | 404
  - `POST /api/servers/{id}/join` → não existe mais (404/405)

- [ ] **Step 1: Escrever `InviteControllerTest`** (`@SpringBootTest(RANDOM_PORT)` + `TestRestTemplate`, tokens via `userService.register`):
  - `previewSemTokenFunciona` — GET `/api/invites/{code}` sem `Authorization` → 200 com `serverName`.
  - `acceptSemTokenDa401ou403` — POST accept sem token → 401 ou 403.
  - `codigoMalformadoDa404` — GET `/api/invites/..%2Fx`, `/api/invites/` + 200×"a" → 404 (nunca 5xx).
  - `joinAntigoNaoExiste` — POST `/api/servers/{id}/join` com token → status ≠ 2xx.
  - `fluxoCompleto` — alice cria (POST invites), bob aceita (POST accept) → 200 e GET `/api/servers` do bob lista o servidor.
- [ ] **Step 2: Rodar e ver falhar** — `mvn -q -f "ChatterHub - API/pom.xml" test -Dtest=InviteControllerTest` → falhas 404/401.
- [ ] **Step 3: Implementar** `InviteController` (`@RequestMapping("/api/invites")`), o `POST /{id}/invites` no `ServerController`, remover `/{id}/join`, e em `SecurityConfig` `auth.requestMatchers(HttpMethod.GET, "/api/invites/*").permitAll();`.
- [ ] **Step 4: Rodar tudo** — `mvn -q -f "ChatterHub - API/pom.xml" test` → BUILD SUCCESS.
- [ ] **Step 5: Atualizar e2e** — nos dois arquivos, trocar o `/join` por `const inv = await api(\`/servers/${id}/invites\`, 'POST', <token do dono>); await api(\`/invites/${inv.code}/accept\`, 'POST', <token do convidado>);`.
- [ ] **Step 6: Commit** — `feat(api): rotas de convite e remove join direto`

### Task 3: Front — sem servidor automático + aceitar convite

**Files:**
- Modify: `ChatterHub - Front/src/app/services/server.service.ts` (remover auto-criação ~linha 50; trocar `joinServer` por `createInvite`, `previewInvite`, `acceptInvite`)
- Modify: `ChatterHub - Front/src/app/layout/main-area/main-area.component.html` (texto do estado vazio)
- Create: `ChatterHub - Front/src/app/layout/invite-page/invite-page.component.ts|html`
- Modify: `ChatterHub - Front/src/app/app.routes.ts`

**Interfaces:**
- Consumes: endpoints da Task 2.
- Produces (em `ServerService`):
  - `createInvite(serverId: string): Promise<{ code: string; expiresAt: string }>`
  - `previewInvite(code: string): Promise<{ serverId: string; serverName: string; iconUrl?: string; initials: string; memberCount: number }>`
  - `acceptInvite(code: string): Promise<Server>` — depois de aceitar: `loadServers()` e `setActiveServer(server.id)`.
  - `inviteUrl(code: string): string` → `${window.location.origin}/convite/${code}`

- [ ] **Step 1:** Em `loadServers`, no ramo `mapped.length === 0`, só `this._activeServerId.set(null)` (sem `createServer`).
- [ ] **Step 2:** Estado vazio do `main-area`: subtítulo "Crie seu próprio servidor ou abra um link de convite que alguém te enviou."
- [ ] **Step 3:** Rota `{ path: 'convite/:code', loadComponent: InvitePageComponent }` antes do `**`, **sem**
  `authGuard` (o guard cancelaria a navegação inicial e perderia o código). Deslogado, o `app.component` mostra o
  login e não renderiza o `<router-outlet>`; quando o login conclui, o outlet aparece e ativa a rota já resolvida,
  abrindo o convite. Conferir que o `<router-outlet>` fica dentro do bloco `*ngIf="authService.isLoggedIn()"`.
- [ ] **Step 4:** `InvitePageComponent`: ao iniciar chama `previewInvite`; mostra card centralizado (ícone/iniciais, "Você foi convidado para", nome, "N membros", botão **Entrar no servidor**). Erro → "Este convite é inválido ou expirou." com botão "Voltar". Ao aceitar → `router.navigate(['/'])`.
- [ ] **Step 5: Build** — `npx --prefix "ChatterHub - Front" ng build` → sem erros.
- [ ] **Step 6: Commit** — `feat(front): conta sem servidor e página de convite`

### Task 4: Front — modal "Convidar pessoas"

**Files:**
- Create: `ChatterHub - Front/src/app/layout/invite-modal/invite-modal.component.ts|html`
- Modify: `ChatterHub - Front/src/app/layout/channel-sidebar/channel-sidebar.component.html:5` e `.ts`

**Interfaces:**
- Consumes: `ServerService.createInvite`, `inviteUrl` (Task 3).
- Produces: `InviteModalComponent.open(serverId: string): void`.

- [ ] **Step 1:** Ícone `user-plus` ao lado do nome do servidor no cabeçalho da `channel-sidebar` (só com servidor ativo), abre o modal.
- [ ] **Step 2:** Modal no estilo do `create-server-modal`: título "Convidar amigos para {nome}", campo só-leitura com o link, botão **Copiar** (`navigator.clipboard.writeText`, vira "Copiado!" por 2 s), texto "O link expira em 7 dias.", botão "Gerar novo link".
- [ ] **Step 3: Build** — `npx --prefix "ChatterHub - Front" ng build` → sem erros.
- [ ] **Step 4: Commit** — `feat(front): modal de convite`

### Task 5: Verificação ponta a ponta (navegador)

- [ ] **Step 1:** Subir API (`-Dspring-boot.run.arguments=--server.port=8081`) e Front (`ng serve --port 4200 --proxy-config ../.claude/proxy.local.json`).
- [ ] **Step 2:** Conta A nova → vê "Bem-vindo", sem servidor. Cria servidor, abre "Convidar", copia o link.
- [ ] **Step 3:** Em outra aba anônima, abrir o link deslogado → login/cadastro da conta B → cai no card do convite → "Entrar" → servidor aparece.
- [ ] **Step 4:** A e B entram na "Sala Geral": ambos aparecem na lista da call; mensagem no `#geral` chega na outra aba sem recarregar.
- [ ] **Step 5:** Abrir `/convite/XXXXXXXX` → "Este convite é inválido ou expirou."
