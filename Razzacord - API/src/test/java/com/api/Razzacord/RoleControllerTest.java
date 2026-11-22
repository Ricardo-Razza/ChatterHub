package com.api.Razzacord;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.service.UserService;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RoleControllerTest {

    private static final long CREATE_INVITE = 1, MANAGE_CHANNELS = 2, KICK_MEMBERS = 16, MANAGE_ROLES = 128;

    @LocalServerPort int port;
    @Autowired UserService userService;
    private final TestRestTemplate rest = new TestRestTemplate();

    record U(String token, String id) {}

    private U user(String prefix) {
        AuthRequest r = new AuthRequest();
        r.setUsername(prefix + "_" + UUID.randomUUID().toString().substring(0, 8));
        r.setPassword("senhaSegura123");
        AuthResponse a = userService.register(r);
        return new U(a.getToken(), a.getUser().getId().toString());
    }

    private ResponseEntity<JsonNode> call(HttpMethod m, String path, String token, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.setBearerAuth(token);
        return rest.exchange(URI.create("http://localhost:" + port + path), m, new HttpEntity<>(body, h), JsonNode.class);
    }

    private String createServer(U owner) {
        return call(HttpMethod.POST, "/api/servers", owner.token(), Map.of("name", "srv")).getBody().get("id").asText();
    }

    private void join(U owner, String serverId, U user) {
        String code = call(HttpMethod.POST, "/api/servers/" + serverId + "/invites", owner.token(), null)
                .getBody().get("code").asText();
        assertEquals(200, call(HttpMethod.POST, "/api/invites/" + code + "/accept", user.token(), null).getStatusCode().value());
    }

    private String roles(String serverId) {
        return "/api/servers/" + serverId + "/roles";
    }

    private JsonNode createRole(U who, String serverId, String name, long perms) {
        ResponseEntity<JsonNode> r = call(HttpMethod.POST, roles(serverId), who.token(),
                Map.of("name", name, "color", "#FF0000", "permissions", perms));
        assertEquals(200, r.getStatusCode().value(), "criar " + name);
        return r.getBody();
    }

    private int assign(U actor, String serverId, String userId, List<String> roleIds) {
        return call(HttpMethod.PUT, "/api/servers/" + serverId + "/members/" + userId + "/roles", actor.token(),
                Map.of("roleIds", roleIds)).getStatusCode().value();
    }

    private int position(String serverId, U viewer, String roleId) {
        for (JsonNode n : call(HttpMethod.GET, roles(serverId), viewer.token(), null).getBody()) {
            if (roleId.equals(n.get("id").asText())) return n.get("position").asInt();
        }
        throw new AssertionError("cargo não encontrado na lista");
    }

    /** Dono + gerente (cargo "Gerente" com MANAGE_ROLES, no meio) + cargos Low (abaixo) e High (acima). */
    private static class Setup {
        U owner, mgr, bob;
        String serverId, low, mgrRole, high;
    }

    private Setup setup() {
        Setup s = new Setup();
        s.owner = user("owner");
        s.mgr = user("mgr");
        s.bob = user("bob");
        s.serverId = createServer(s.owner);
        join(s.owner, s.serverId, s.mgr);
        join(s.owner, s.serverId, s.bob);
        s.low = createRole(s.owner, s.serverId, "Low", CREATE_INVITE).get("id").asText();
        s.mgrRole = createRole(s.owner, s.serverId, "Gerente", MANAGE_ROLES).get("id").asText();
        s.high = createRole(s.owner, s.serverId, "High", MANAGE_CHANNELS).get("id").asText();
        assertEquals(200, assign(s.owner, s.serverId, s.mgr.id(), List.of(s.mgrRole)));
        return s;
    }

    @Test
    void ownerCreatesListsUpdatesDeletesRole() {
        U owner = user("owner");
        String id = createServer(owner);

        JsonNode created = call(HttpMethod.POST, roles(id), owner.token(),
                Map.of("name", "Mod", "color", "#FF0000", "permissions", 2)).getBody();
        assertEquals("Mod", created.get("name").asText());
        assertEquals("#FF0000", created.get("color").asText());
        assertEquals(2, created.get("permissions").asLong());
        String roleId = created.get("id").asText();

        JsonNode list = call(HttpMethod.GET, roles(id), owner.token(), null).getBody();
        assertEquals(1, list.size());
        assertEquals(roleId, list.get(0).get("id").asText());

        ResponseEntity<JsonNode> upd = call(HttpMethod.PUT, roles(id) + "/" + roleId, owner.token(), Map.of("name", "Moderador"));
        assertEquals(200, upd.getStatusCode().value());
        assertEquals("Moderador", upd.getBody().get("name").asText());
        assertEquals("#FF0000", upd.getBody().get("color").asText());
        assertEquals(2, upd.getBody().get("permissions").asLong());

        assertEquals(204, call(HttpMethod.DELETE, roles(id) + "/" + roleId, owner.token(), null).getStatusCode().value());
        assertEquals(0, call(HttpMethod.GET, roles(id), owner.token(), null).getBody().size());
    }

    @Test
    void deletingRoleRemovesItFromMembers() {
        Setup s = setup();
        assertEquals(200, assign(s.owner, s.serverId, s.bob.id(), List.of(s.low)));
        assertEquals(204, call(HttpMethod.DELETE, roles(s.serverId) + "/" + s.low, s.owner.token(), null).getStatusCode().value());
        for (JsonNode m : call(HttpMethod.GET, "/api/servers/" + s.serverId + "/members", s.owner.token(), null).getBody()) {
            if (s.bob.id().equals(m.get("id").asText())) assertEquals(0, m.get("roleIds").size());
        }
    }

    @Test
    void memberWithoutManageRolesGets403() {
        U owner = user("owner");
        U bob = user("bob");
        String id = createServer(owner);
        join(owner, id, bob);
        String roleId = createRole(owner, id, "Mod", 1).get("id").asText();

        assertEquals(200, call(HttpMethod.GET, roles(id), bob.token(), null).getStatusCode().value());
        assertEquals(403, call(HttpMethod.POST, roles(id), bob.token(), Map.of("name", "X", "permissions", 0)).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, roles(id) + "/" + roleId, bob.token(), Map.of("name", "Y")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.DELETE, roles(id) + "/" + roleId, bob.token(), null).getStatusCode().value());
        assertEquals(403, assign(bob, id, bob.id(), List.of(roleId)));
    }

    @Test
    void nonMemberCannotListRoles() {
        U owner = user("owner");
        U outsider = user("out");
        String id = createServer(owner);
        assertEquals(403, call(HttpMethod.GET, roles(id), outsider.token(), null).getStatusCode().value());
    }

    @Test
    void invalidNameOrColorGets400() {
        U owner = user("owner");
        String id = createServer(owner);
        assertEquals(400, call(HttpMethod.POST, roles(id), owner.token(), Map.of("name", "  ", "permissions", 0)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, roles(id), owner.token(), Map.of("name", "a".repeat(33), "permissions", 0)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, roles(id), owner.token(), Map.of("name", "ok", "color", "red", "permissions", 0)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, roles(id), owner.token(), Map.of("name", "ok", "permissions", 256)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.POST, roles(id), owner.token(), Map.of("name", "ok", "permissions", -1)).getStatusCode().value());
        assertEquals(0, call(HttpMethod.GET, roles(id), owner.token(), null).getBody().size());
    }

    @Test
    void managerCannotGrantPermissionHeLacks() {
        Setup s = setup();
        // gerente tem MANAGE_ROLES + padrão (CREATE_INVITE, STREAM); KICK_MEMBERS ele não tem
        assertEquals(403, call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Kicker", "permissions", KICK_MEMBERS)).getStatusCode().value());
        assertEquals(200, call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Convida", "permissions", CREATE_INVITE)).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, roles(s.serverId) + "/" + s.low, s.mgr.token(),
                Map.of("permissions", KICK_MEMBERS)).getStatusCode().value());
    }

    @Test
    void managerCannotTouchRoleAtOrAboveHisTop() {
        Setup s = setup();
        String base = roles(s.serverId) + "/";
        assertEquals(403, call(HttpMethod.PUT, base + s.mgrRole, s.mgr.token(), Map.of("name", "Self")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, base + s.high, s.mgr.token(), Map.of("name", "Hi")).getStatusCode().value());
        assertEquals(403, call(HttpMethod.DELETE, base + s.high, s.mgr.token(), null).getStatusCode().value());
        assertEquals(200, call(HttpMethod.PUT, base + s.low, s.mgr.token(), Map.of("name", "Baixo")).getStatusCode().value());
        assertEquals(204, call(HttpMethod.DELETE, base + s.low, s.mgr.token(), null).getStatusCode().value());
    }

    @Test
    void managerCannotAssignHisOwnOrHigherRole() {
        Setup s = setup();
        assertEquals(403, assign(s.mgr, s.serverId, s.mgr.id(), List.of(s.mgrRole)));
        assertEquals(403, assign(s.mgr, s.serverId, s.bob.id(), List.of(s.mgrRole)));
        assertEquals(403, assign(s.mgr, s.serverId, s.bob.id(), List.of(s.high)));
        assertEquals(200, assign(s.mgr, s.serverId, s.bob.id(), List.of(s.low)));
        // remover um cargo abaixo dele também vale; cargo de outro servidor é 404
        U other = user("other");
        String otherServer = createServer(other);
        String foreign = createRole(other, otherServer, "Alheio", 0).get("id").asText();
        assertEquals(404, assign(s.mgr, s.serverId, s.bob.id(), List.of(s.low, foreign)));
        assertEquals(200, assign(s.mgr, s.serverId, s.bob.id(), List.of()));
    }

    @Test
    void managerCannotChangeRolesOfEqualOrHigherMemberOrOwner() {
        Setup s = setup();
        U peer = user("peer");
        join(s.owner, s.serverId, peer);
        assertEquals(200, assign(s.owner, s.serverId, peer.id(), List.of(s.mgrRole)));
        U boss = user("boss");
        join(s.owner, s.serverId, boss);
        assertEquals(200, assign(s.owner, s.serverId, boss.id(), List.of(s.high)));

        assertEquals(403, assign(s.mgr, s.serverId, peer.id(), List.of(s.mgrRole, s.low)));
        assertEquals(403, assign(s.mgr, s.serverId, boss.id(), List.of(s.high, s.low)));
        assertEquals(403, assign(s.mgr, s.serverId, s.owner.id(), List.of(s.low)));
    }


    @Test
    void managerCreatedRoleLandsJustBelowHim() {
        Setup s = setup();
        int mgrBefore = position(s.serverId, s.owner, s.mgrRole);
        int lowBefore = position(s.serverId, s.owner, s.low);
        int highBefore = position(s.serverId, s.owner, s.high);

        String newId = call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Novo", "permissions", 0)).getBody().get("id").asText();

        int mgrAfter = position(s.serverId, s.owner, s.mgrRole);
        int newPos = position(s.serverId, s.owner, newId);
        assertTrue(newPos < mgrAfter, "novo abaixo do gerente");
        assertTrue(newPos > position(s.serverId, s.owner, s.low), "novo acima do que já estava abaixo");
        assertEquals(mgrBefore + 1, mgrAfter);
        assertEquals(highBefore + 1, position(s.serverId, s.owner, s.high));
        assertEquals(lowBefore, position(s.serverId, s.owner, s.low));
    }

    @Test
    void reorderByManagerMovingRoleAboveHimIs403AndNothingChanges() {
        Setup s = setup();
        int high = position(s.serverId, s.owner, s.high);
        int mgrPos = position(s.serverId, s.owner, s.mgrRole);
        int low = position(s.serverId, s.owner, s.low);

        // tenta trocar High e Gerente
        ResponseEntity<JsonNode> r = call(HttpMethod.PUT, roles(s.serverId) + "/order", s.mgr.token(),
                Map.of("roleIds", List.of(s.mgrRole, s.high, s.low)));
        assertEquals(403, r.getStatusCode().value());
        assertEquals(high, position(s.serverId, s.owner, s.high));
        assertEquals(mgrPos, position(s.serverId, s.owner, s.mgrRole));
        assertEquals(low, position(s.serverId, s.owner, s.low));

        // lista incompleta é 400
        assertEquals(400, call(HttpMethod.PUT, roles(s.serverId) + "/order", s.owner.token(),
                Map.of("roleIds", List.of(s.high, s.low))).getStatusCode().value());
    }

    @Test
    void reorderBelowManagerAndByOwnerWorks() {
        Setup s = setup();
        String low2 = call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Low2", "permissions", 0)).getBody().get("id").asText();
        // ordem atual (alto -> baixo): High, Gerente, Low2, Low. Gerente inverte os dois de baixo.
        ResponseEntity<JsonNode> r = call(HttpMethod.PUT, roles(s.serverId) + "/order", s.mgr.token(),
                Map.of("roleIds", List.of(s.high, s.mgrRole, s.low, low2)));
        assertEquals(200, r.getStatusCode().value());
        assertEquals(s.low, r.getBody().get(2).get("id").asText());
        assertEquals(4, r.getBody().get(0).get("position").asInt());
        assertEquals(1, r.getBody().get(3).get("position").asInt());

        ResponseEntity<JsonNode> own = call(HttpMethod.PUT, roles(s.serverId) + "/order", s.owner.token(),
                Map.of("roleIds", List.of(s.mgrRole, s.high, s.low, low2)));
        assertEquals(200, own.getStatusCode().value());
        assertEquals(s.mgrRole, own.getBody().get(0).get("id").asText());
    }

    @Test
    void onlyOwnerChangesDefaultPermissions() {
        Setup s = setup();
        String path = "/api/servers/" + s.serverId + "/default-permissions";
        assertEquals(403, call(HttpMethod.PUT, path, s.mgr.token(), Map.of("permissions", 3)).getStatusCode().value());
        assertEquals(400, call(HttpMethod.PUT, path, s.owner.token(), Map.of("permissions", 999)).getStatusCode().value());
        assertEquals(204, call(HttpMethod.PUT, path, s.owner.token(), Map.of("permissions", 3)).getStatusCode().value());

        JsonNode me = call(HttpMethod.GET, "/api/servers/" + s.serverId + "/me/permissions", s.bob.token(), null).getBody();
        assertEquals(3, me.get("permissions").asLong());
    }

    @Test
    void myPermissionsReflectsRoles() {
        Setup s = setup();
        String path = "/api/servers/" + s.serverId + "/me/permissions";

        JsonNode owner = call(HttpMethod.GET, path, s.owner.token(), null).getBody();
        assertTrue(owner.get("owner").asBoolean());
        assertEquals(255, owner.get("permissions").asLong());

        JsonNode mgr = call(HttpMethod.GET, path, s.mgr.token(), null).getBody();
        assertFalse(mgr.get("owner").asBoolean());
        assertEquals(65 | MANAGE_ROLES, mgr.get("permissions").asLong());
        assertEquals(position(s.serverId, s.owner, s.mgrRole), mgr.get("topPosition").asInt());

        JsonNode bob = call(HttpMethod.GET, path, s.bob.token(), null).getBody();
        assertEquals(65, bob.get("permissions").asLong());
        assertEquals(0, bob.get("topPosition").asInt());

        assertEquals(403, call(HttpMethod.GET, path, user("out").token(), null).getStatusCode().value());
    }

    @Test
    void membersListIncludesRoleIdsAndOwnerFlag() {
        Setup s = setup();
        assertEquals(200, assign(s.owner, s.serverId, s.bob.id(), List.of(s.low, s.high)));

        JsonNode members = call(HttpMethod.GET, "/api/servers/" + s.serverId + "/members", s.bob.token(), null).getBody();
        assertEquals(3, members.size());
        for (JsonNode m : members) {
            String id = m.get("id").asText();
            assertNotNull(m.get("username"));
            if (id.equals(s.owner.id())) {
                assertTrue(m.get("owner").asBoolean());
                assertEquals(0, m.get("roleIds").size());
            } else if (id.equals(s.bob.id())) {
                assertFalse(m.get("owner").asBoolean());
                assertEquals(2, m.get("roleIds").size());
            } else {
                assertEquals(s.mgr.id(), id);
                assertEquals(s.mgrRole, m.get("roleIds").get(0).asText());
            }
        }
    }

    @Test
    void managerReorderWorksAfterOwnerDeletesBottomRole() {
        Setup s = setup();
        String order = roles(s.serverId) + "/order";
        String low2 = call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Low2", "permissions", 0)).getBody().get("id").asText();
        // ordem: High, Gerente, Low2, Low. Dono apaga o de baixo (Low): posições compactam.
        assertEquals(204, call(HttpMethod.DELETE, roles(s.serverId) + "/" + s.low, s.owner.token(), null).getStatusCode().value());
        assertEquals(1, position(s.serverId, s.owner, low2));
        assertEquals(2, position(s.serverId, s.owner, s.mgrRole));
        assertEquals(3, position(s.serverId, s.owner, s.high));

        assertEquals(200, call(HttpMethod.PUT, order, s.mgr.token(),
                Map.of("roleIds", List.of(s.high, s.mgrRole, low2))).getStatusCode().value());
        String low3 = call(HttpMethod.POST, roles(s.serverId), s.mgr.token(),
                Map.of("name", "Low3", "permissions", 0)).getBody().get("id").asText();
        assertEquals(200, call(HttpMethod.PUT, order, s.mgr.token(),
                Map.of("roleIds", List.of(s.high, s.mgrRole, low2, low3))).getStatusCode().value());
        assertEquals(200, call(HttpMethod.PUT, order, s.mgr.token(),
                Map.of("roleIds", List.of(s.high, s.mgrRole, low3, low2))).getStatusCode().value());
        assertEquals(403, call(HttpMethod.PUT, order, s.mgr.token(),
                Map.of("roleIds", List.of(s.high, low3, s.mgrRole, low2))).getStatusCode().value());
    }

    @Test
    void nonOwnerWithoutAnyRoleCannotCreateRole() {
        Setup s = setup();
        // bob não tem cargo (topPosition 0) mas ganha MANAGE_ROLES pelas permissões padrão
        assertEquals(204, call(HttpMethod.PUT, "/api/servers/" + s.serverId + "/default-permissions", s.owner.token(),
                Map.of("permissions", 65 | MANAGE_ROLES)).getStatusCode().value());
        assertEquals(403, call(HttpMethod.POST, roles(s.serverId), s.bob.token(),
                Map.of("name", "X", "permissions", 0)).getStatusCode().value());
    }

    @Test
    void deletingServerRemovesRoles() {
        Setup s = setup();
        assertEquals(204, call(HttpMethod.DELETE, "/api/servers/" + s.serverId, s.owner.token(), null).getStatusCode().value());
        assertEquals(404, call(HttpMethod.GET, roles(s.serverId), s.owner.token(), null).getStatusCode().value());
    }
}
