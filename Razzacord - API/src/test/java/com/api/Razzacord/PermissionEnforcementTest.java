package com.api.Razzacord;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.model.Role;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.UserRepository;
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
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PermissionEnforcementTest {

    private static final long CREATE_INVITE = 1, MANAGE_CHANNELS = 2, MANAGE_SERVER = 4,
            MANAGE_MESSAGES = 8, KICK_MEMBERS = 16;

    @LocalServerPort int port;
    @Autowired UserService userService;
    @Autowired UserRepository userRepository;
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

    private int status(HttpMethod m, String path, U who, Object body) {
        return call(m, path, who.token(), body).getStatusCode().value();
    }

    private String createServer(U owner) {
        return call(HttpMethod.POST, "/api/servers", owner.token(), Map.of("name", "srv")).getBody().get("id").asText();
    }

    private String invite(U owner, String serverId) {
        return call(HttpMethod.POST, "/api/servers/" + serverId + "/invites", owner.token(), null)
                .getBody().get("code").asText();
    }

    private void join(U owner, String serverId, U user) {
        assertEquals(200, status(HttpMethod.POST, "/api/invites/" + invite(owner, serverId) + "/accept", user, null));
    }

    private String createRole(U who, String serverId, String name, long perms) {
        ResponseEntity<JsonNode> r = call(HttpMethod.POST, "/api/servers/" + serverId + "/roles", who.token(),
                Map.of("name", name, "color", "#FF0000", "permissions", perms));
        assertEquals(200, r.getStatusCode().value(), "criar " + name);
        return r.getBody().get("id").asText();
    }

    private void assign(U actor, String serverId, U target, String... roleIds) {
        assertEquals(200, status(HttpMethod.PUT, "/api/servers/" + serverId + "/members/" + target.id() + "/roles",
                actor, Map.of("roleIds", List.of(roleIds))));
    }

    private Map<String, Object> channelBody(String serverId) {
        return Map.of("name", "novo", "type", "TEXT", "serverId", serverId);
    }

    private JsonNode member(U viewer, String serverId, U target) {
        for (JsonNode m : call(HttpMethod.GET, "/api/servers/" + serverId + "/members", viewer.token(), null).getBody()) {
            if (target.id().equals(m.get("id").asText())) return m;
        }
        return null;
    }

    private boolean isMember(U viewer, String serverId, U target) {
        return member(viewer, serverId, target) != null;
    }

    @Test
    void customizationUsesServerAndChannelPermissions() {
        U owner = user("owner"), bob = user("bob");
        String id = createServer(owner);
        String server = "/api/servers/" + id;
        join(owner, id, bob);

        JsonNode channels = call(HttpMethod.GET, server + "/channels", owner.token(), null).getBody();
        String text = channels.get(0).get("id").asText();
        String voice = channels.get(1).get("id").asText();
        Map<String, String> settings = Map.of("name", "Comunidade", "description", "Regras e novidades",
                "accentColor", "#336699", "bannerUrl", "https://example.com/banner.png", "systemChannelId", text);

        assertEquals(403, status(HttpMethod.PUT, server, bob, settings));
        assertEquals(400, status(HttpMethod.PUT, server, owner, Map.of("name", "srv", "systemChannelId", voice)));
        assertEquals(400, status(HttpMethod.PUT, server, owner, Map.of("name", "srv", "systemChannelId", UUID.randomUUID())));
        assign(owner, id, bob, createRole(owner, id, "Configurações", MANAGE_SERVER | MANAGE_CHANNELS));
        assertEquals(200, status(HttpMethod.PUT, server, bob, settings));

        String code = invite(owner, id);
        JsonNode preview = call(HttpMethod.GET, "/api/invites/" + code, null, null).getBody();
        assertEquals(settings.get("bannerUrl"), preview.get("bannerUrl").asText());
        assertEquals(settings.get("description"), preview.get("description").asText());

        String channel = "/api/channels/" + text;
        Map<String, String> details = Map.of("name", "avisos", "type", "announcement", "topic", "Novidades", "category", "Informações");
        U guest = user("guest");
        String accept = "/api/invites/" + code + "/accept";
        CompletableFuture<Integer> firstAccept = CompletableFuture.supplyAsync(() -> status(HttpMethod.POST, accept, guest, null));
        CompletableFuture<Integer> secondAccept = CompletableFuture.supplyAsync(() -> status(HttpMethod.POST, accept, guest, null));
        assertEquals(200, firstAccept.join());
        assertEquals(200, secondAccept.join());
        assertEquals(200, status(HttpMethod.POST, accept, guest, null));
        assertEquals(403, status(HttpMethod.PUT, channel, guest, details));
        assertEquals(200, status(HttpMethod.PUT, channel, bob, details));

        String order = server + "/channels/order";
        assertEquals(403, status(HttpMethod.PUT, order, guest, List.of(voice, text)));
        assertEquals(400, status(HttpMethod.PUT, order, bob, List.of(voice, voice)));
        assertEquals(200, status(HttpMethod.PUT, order, bob, List.of(voice, text)));
        JsonNode reordered = call(HttpMethod.GET, server + "/channels", guest.token(), null).getBody();
        assertEquals(voice, reordered.get(0).get("id").asText());
        assertEquals("announcement", reordered.get(1).get("type").asText());
        assertEquals("Novidades", reordered.get(1).get("topic").asText());
        assertEquals("Informações", reordered.get(1).get("category").asText());

        String messages = channel + "/messages";
        JsonNode history = call(HttpMethod.GET, messages, guest.token(), null).getBody();
        assertEquals(1, history.size());
        assertTrue(history.get(0).get("systemMessage").asBoolean());
        assertTrue(history.get(0).get("content").asText().endsWith(" entrou no servidor"));
        assertEquals(403, status(HttpMethod.POST, messages, guest, Map.of("content", "Sem permissão")));
        assertEquals(200, status(HttpMethod.POST, messages, owner, Map.of("content", "Anúncio")));

        assertEquals(204, status(HttpMethod.DELETE, channel, bob, null));
        JsonNode saved = call(HttpMethod.GET, "/api/servers", guest.token(), null).getBody().get(0);
        assertTrue(saved.path("systemChannelId").isNull());
    }

    @Test
    void channelCreateNeedsManageChannels() {
        U owner = user("owner"), bob = user("bob");
        String id = createServer(owner);
        join(owner, id, bob);
        assertEquals(403, status(HttpMethod.POST, "/api/channels", bob, channelBody(id)));

        assign(owner, id, bob, createRole(owner, id, "Canais", MANAGE_CHANNELS));
        ResponseEntity<JsonNode> ok = call(HttpMethod.POST, "/api/channels", bob.token(), channelBody(id));
        assertEquals(200, ok.getStatusCode().value());
        String channelId = ok.getBody().get("id").asText();
        assertEquals(204, status(HttpMethod.DELETE, "/api/channels/" + channelId, bob, null));
    }

    @Test
    void channelDeleteNeedsManageChannels() {
        U owner = user("owner"), bob = user("bob");
        String id = createServer(owner);
        join(owner, id, bob);
        String channelId = call(HttpMethod.POST, "/api/channels", owner.token(), channelBody(id)).getBody().get("id").asText();
        assertEquals(403, status(HttpMethod.DELETE, "/api/channels/" + channelId, bob, null));
        assertEquals(204, status(HttpMethod.DELETE, "/api/channels/" + channelId, owner, null));
    }

    @Test
    void globalAdminRoleGivesNoServerPower() {
        U owner = user("owner"), admin = user("admin");
        String id = createServer(owner);
        join(owner, id, admin);
        User u = userRepository.findById(UUID.fromString(admin.id())).orElseThrow();
        u.setRole(Role.ADMIN);
        userRepository.save(u);
        assertEquals(403, status(HttpMethod.POST, "/api/channels", admin, channelBody(id)));
    }

    @Test
    void inviteCreateFollowsDefaultPermissions() {
        U owner = user("owner"), bob = user("bob");
        String id = createServer(owner);
        join(owner, id, bob);
        assertEquals(200, status(HttpMethod.POST, "/api/servers/" + id + "/invites", bob, null));

        assertEquals(204, status(HttpMethod.PUT, "/api/servers/" + id + "/default-permissions", owner, Map.of("permissions", 0)));
        assertEquals(403, status(HttpMethod.POST, "/api/servers/" + id + "/invites", bob, null));

        assign(owner, id, bob, createRole(owner, id, "Convites", CREATE_INVITE));
        assertEquals(200, status(HttpMethod.POST, "/api/servers/" + id + "/invites", bob, null));
    }

    @Test
    void listAndRevokeInvitesNeedManageServer() {
        U owner = user("owner"), bob = user("bob");
        String id = createServer(owner);
        join(owner, id, bob);
        String code = invite(owner, id);
        assertEquals(403, status(HttpMethod.GET, "/api/servers/" + id + "/invites", bob, null));
        assertEquals(403, status(HttpMethod.DELETE, "/api/invites/" + code, bob, null));

        assign(owner, id, bob, createRole(owner, id, "Gestor", MANAGE_SERVER));
        assertEquals(200, status(HttpMethod.GET, "/api/servers/" + id + "/invites", bob, null));
        assertEquals(204, status(HttpMethod.DELETE, "/api/invites/" + code, bob, null));
    }

    @Test
    void deleteOthersMessageNeedsManageMessages() {
        U owner = user("owner"), alice = user("alice"), bob = user("bob");
        String id = createServer(owner);
        join(owner, id, alice);
        join(owner, id, bob);
        String channelId = call(HttpMethod.GET, "/api/servers/" + id + "/channels", owner.token(), null)
                .getBody().get(0).get("id").asText();
        String msgPath = "/api/channels/" + channelId + "/messages";

        String m1 = call(HttpMethod.POST, msgPath, alice.token(), Map.of("content", "oi")).getBody().get("id").asText();
        assertEquals(403, status(HttpMethod.DELETE, "/api/messages/" + m1, bob, null));
        assertEquals(200, status(HttpMethod.DELETE, "/api/messages/" + m1, alice, null)); // autor sempre pode

        String m2 = call(HttpMethod.POST, msgPath, alice.token(), Map.of("content", "oi2")).getBody().get("id").asText();
        assign(owner, id, bob, createRole(owner, id, "Mod msgs", MANAGE_MESSAGES));
        assertEquals(200, status(HttpMethod.DELETE, "/api/messages/" + m2, bob, null));
    }

    @Test
    void kickWithoutPermissionIs403() {
        U owner = user("owner"), bob = user("bob"), carl = user("carl");
        String id = createServer(owner);
        join(owner, id, bob);
        join(owner, id, carl);
        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + carl.id(), bob, null));
        assertTrue(isMember(owner, id, carl));
    }

    @Test
    void kickOwnerOrEqualOrHigherIs403() {
        U owner = user("owner"), mod = user("mod"), peer = user("peer"), boss = user("boss");
        String id = createServer(owner);
        join(owner, id, mod);
        join(owner, id, peer);
        join(owner, id, boss);
        String low = createRole(owner, id, "Low", KICK_MEMBERS);
        String high = createRole(owner, id, "High", KICK_MEMBERS);
        assign(owner, id, mod, low);
        assign(owner, id, peer, low);
        assign(owner, id, boss, high);

        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + owner.id(), mod, null));
        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + peer.id(), mod, null));
        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + boss.id(), mod, null));
        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + mod.id(), mod, null));
        assertEquals(403, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + owner.id(), boss, null));
        assertTrue(isMember(owner, id, peer));
        assertTrue(isMember(owner, id, boss));
    }

    @Test
    void kickValidRemovesMemberAndAccess() {
        U owner = user("owner"), mod = user("mod"), carl = user("carl");
        String id = createServer(owner);
        join(owner, id, mod);
        join(owner, id, carl);
        String modRole = createRole(owner, id, "Mod", KICK_MEMBERS);
        String low = createRole(owner, id, "Low", CREATE_INVITE);
        assign(owner, id, mod, modRole);
        assign(owner, id, carl, low);
        // lista do mais alto para o mais baixo: Mod acima de Low
        assertEquals(200, status(HttpMethod.PUT, "/api/servers/" + id + "/roles/order", owner,
                Map.of("roleIds", List.of(modRole, low))));

        assertEquals(204, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + carl.id(), mod, null));
        assertFalse(isMember(owner, id, carl));
        assertEquals(403, status(HttpMethod.GET, "/api/servers/" + id + "/channels", carl, null));
    }

    @Test
    void kickRemovesRolesSoRejoinHasNone() {
        U owner = user("owner"), carl = user("carl");
        String id = createServer(owner);
        join(owner, id, carl);
        assign(owner, id, carl, createRole(owner, id, "Low", CREATE_INVITE));
        assertEquals(204, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + carl.id(), owner, null));
        join(owner, id, carl);
        assertEquals(0, member(owner, id, carl).get("roleIds").size());
    }

    @Test
    void kickNonMemberTargetIs404() {
        U owner = user("owner"), stranger = user("stranger");
        String id = createServer(owner);
        assertEquals(404, status(HttpMethod.DELETE, "/api/servers/" + id + "/members/" + stranger.id(), owner, null));
    }

    @Test
    void leaveAndRejoinHasNoRoles() {
        U owner = user("owner"), carl = user("carl");
        String id = createServer(owner);
        join(owner, id, carl);
        assign(owner, id, carl, createRole(owner, id, "Low", CREATE_INVITE));
        assertEquals(200, status(HttpMethod.POST, "/api/servers/" + id + "/leave", carl, null));
        join(owner, id, carl);
        assertEquals(0, member(owner, id, carl).get("roleIds").size());
    }
}
