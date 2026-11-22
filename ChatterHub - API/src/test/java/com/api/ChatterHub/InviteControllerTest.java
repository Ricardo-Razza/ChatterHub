package com.api.ChatterHub;

import com.api.ChatterHub.dto.AuthRequest;
import com.api.ChatterHub.dto.AuthResponse;
import com.api.ChatterHub.service.UserService;
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
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class InviteControllerTest {

    @LocalServerPort int port;
    @Autowired UserService userService;
    private final TestRestTemplate rest = new TestRestTemplate();

    private String token(String prefix) {
        AuthRequest r = new AuthRequest();
        r.setUsername(prefix + "_" + UUID.randomUUID().toString().substring(0, 8));
        r.setPassword("senhaSegura123");
        AuthResponse a = userService.register(r);
        return a.getToken();
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private ResponseEntity<JsonNode> call(HttpMethod m, String path, String token, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.setBearerAuth(token);
        return rest.exchange(uri(path), m, new HttpEntity<>(body, h), JsonNode.class);
    }

    private String createServer(String token) {
        return call(HttpMethod.POST, "/api/servers", token, Map.of("name", "srv")).getBody().get("id").asText();
    }

    private String createInvite(String token, String serverId) {
        ResponseEntity<JsonNode> r = call(HttpMethod.POST, "/api/servers/" + serverId + "/invites", token, null);
        assertEquals(200, r.getStatusCode().value());
        return r.getBody().get("code").asText();
    }

    @Test
    void previewSemTokenFunciona() {
        String alice = token("alice");
        String code = createInvite(alice, createServer(alice));
        ResponseEntity<JsonNode> r = call(HttpMethod.GET, "/api/invites/" + code, null, null);
        assertEquals(200, r.getStatusCode().value());
        assertEquals("srv", r.getBody().get("serverName").asText());
    }

    @Test
    void acceptSemTokenDa401ou403() {
        String alice = token("alice");
        String code = createInvite(alice, createServer(alice));
        int s = call(HttpMethod.POST, "/api/invites/" + code + "/accept", null, null).getStatusCode().value();
        assertTrue(s == 401 || s == 403, "status " + s);
    }

    @Test
    void codigoMalformadoDa404() {
        ResponseEntity<String> longCode = rest.exchange(uri("/api/invites/" + "a".repeat(200)), HttpMethod.GET,
                HttpEntity.EMPTY, String.class);
        assertEquals(404, longCode.getStatusCode().value());

        ResponseEntity<String> traversal = rest.exchange(uri("/api/invites/..%2Fx"), HttpMethod.GET,
                HttpEntity.EMPTY, String.class);
        assertTrue(traversal.getStatusCode().is4xxClientError(), "status " + traversal.getStatusCode());
        assertFalse(traversal.getStatusCode().is5xxServerError());
    }

    @Test
    void joinAntigoNaoExiste() {
        String alice = token("alice");
        String bob = token("bob");
        String id = createServer(alice);
        ResponseEntity<JsonNode> r = call(HttpMethod.POST, "/api/servers/" + id + "/join", bob, null);
        assertFalse(r.getStatusCode().is2xxSuccessful(), "status " + r.getStatusCode());
    }

    @Test
    void fluxoCompleto() {
        String alice = token("alice");
        String bob = token("bob");
        String id = createServer(alice);
        String code = createInvite(alice, id);
        ResponseEntity<JsonNode> acc = call(HttpMethod.POST, "/api/invites/" + code + "/accept", bob, null);
        assertEquals(200, acc.getStatusCode().value());
        JsonNode list = call(HttpMethod.GET, "/api/servers", bob, null).getBody();
        boolean found = false;
        for (JsonNode n : list) if (id.equals(n.get("id").asText())) found = true;
        assertTrue(found, "servidor deve aparecer na lista do bob");
    }
}
