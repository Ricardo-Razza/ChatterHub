package com.api.Razzacord;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ChannelResponse;
import com.api.Razzacord.dto.ServerRequest;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.service.ChannelService;
import com.api.Razzacord.service.ServerService;
import com.api.Razzacord.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Ponta a ponta: autenticação do STOMP, autorização de assinatura, presença e relay dirigido de sinais WebRTC. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "app.voice.disconnect-grace-ms=100")
class VoiceSignalingTest {

    @LocalServerPort
    int port;

    @Autowired UserService userService;
    @Autowired ServerService serverService;
    @Autowired com.api.Razzacord.service.InviteService inviteService;
    @Autowired ChannelService channelService;

    private final ObjectMapper mapper = new ObjectMapper();

    private WebSocketStompClient newClient() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new MappingJackson2MessageConverter());
        return client;
    }

    private StompSession connect(String token) throws Exception {
        StompHeaders connectHeaders = new StompHeaders();
        if (token != null) connectHeaders.add("Authorization", "Bearer " + token);
        return newClient().connectAsync("ws://localhost:" + port + "/ws",
                new WebSocketHttpHeaders(), connectHeaders, new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);
    }

    private BlockingQueue<Map<String, Object>> subscribe(StompSession session, String destination) {
        BlockingQueue<Map<String, Object>> queue = new LinkedBlockingQueue<>();
        session.subscribe(destination, new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return Map.class; }
            @SuppressWarnings("unchecked")
            @Override public void handleFrame(StompHeaders headers, Object payload) { queue.add((Map<String, Object>) payload); }
        });
        return queue;
    }

    private Map<String, Object> next(BlockingQueue<Map<String, Object>> q, String type) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Map<String, Object> m = q.poll(500, TimeUnit.MILLISECONDS);
            if (m != null && type.equals(m.get("type"))) return m;
        }
        fail("Timeout aguardando " + type);
        return null;
    }

    @Test
    void connectWithoutOrWithBadTokenIsRejected() {
        assertThrows(Exception.class, () -> connect(null));
        assertThrows(Exception.class, () -> connect("lixo.lixo.lixo"));
    }

    @Test
    void presenceAndTargetedSignaling() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        AuthResponse alice = userService.register(cred("alice_" + suffix));
        AuthResponse bob = userService.register(cred("bob_" + suffix));
        AuthResponse eve = userService.register(cred("eve_" + suffix));

        // O dono cria o servidor (e canal de voz padrão); bob entra, eve fica de fora.
        authenticateAs(alice.getUser().getUsername());
        ServerResponse server = serverService.createServer(serverReq("srv " + suffix));
        ChannelResponse voice = channelService.getChannelsByServer(server.getId()).stream()
                .filter(c -> "voice".equals(c.getType())).findFirst().orElseThrow();
        String inviteCode = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(bob.getUser().getUsername());
        inviteService.accept(inviteCode);
        SecurityContextHolder.clearContext();

        String topic = "/topic/voice/" + voice.getId();

        StompSession a = connect(alice.getToken());
        StompSession b = connect(bob.getToken());
        StompSession e = connect(eve.getToken());

        // Quem não é membro não pode assinar o tópico (a conexão é derrubada com ERROR).
        BlockingQueue<Map<String, Object>> eveQ = subscribe(e, topic);
        Thread.sleep(500);
        assertFalse(e.isConnected(), "não-membro deveria ser desconectado ao assinar");
        assertTrue(eveQ.isEmpty());

        BlockingQueue<Map<String, Object>> aRoster = subscribe(a, topic);
        BlockingQueue<Map<String, Object>> aSignals = subscribe(a, "/user/queue/voice");
        BlockingQueue<Map<String, Object>> bSignals = subscribe(b, "/user/queue/voice");

        a.send("/app/voice.join", Map.of("channelId", voice.getId().toString(), "state", Map.of("isMuted", false)));
        b.send("/app/voice.join", Map.of("channelId", voice.getId().toString(), "state", Map.of("isMuted", true, "hack", "x")));

        Map<String, Object> roster = null;
        long end = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < end) {
            Map<String, Object> m = next(aRoster, "roster");
            if (((List<?>) m.get("participants")).size() == 2) { roster = m; break; }
        }
        assertNotNull(roster, "roster com 2 participantes");
        for (Object p : (List<?>) roster.get("participants")) {
            Map<?, ?> state = (Map<?, ?>) ((Map<?, ?>) p).get("state");
            assertFalse(state.containsKey("hack"), "chaves desconhecidas devem ser descartadas");
        }

        // alice -> bob: só bob recebe, e o senderId é forçado pelo servidor (o campo falso é ignorado).
        a.send("/app/voice.signal", Map.of(
                "channelId", voice.getId().toString(),
                "targetId", bob.getUser().getId().toString(),
                "type", "offer",
                "senderId", bob.getUser().getId().toString(),
                "data", Map.of("sdp", "fake")));
        Map<String, Object> got = next(bSignals, "offer");
        assertEquals(alice.getUser().getId().toString(), got.get("senderId"));
        assertTrue(aSignals.isEmpty(), "o remetente não deve receber o próprio sinal");

        // Cliente não pode publicar direto no broker.
        b.send(topic, Map.of("type", "roster", "participants", List.of()));
        Thread.sleep(500);
        assertFalse(b.isConnected(), "SEND fora de /app deve ser rejeitado");

        // Desconexão abrupta remove o fantasma da sala.
        a.disconnect();
        a.getSessionId();
        Thread.sleep(300);
        // bob já foi derrubado acima; reconecta para observar o roster.
        StompSession b2 = connect(bob.getToken());
        BlockingQueue<Map<String, Object>> b2Roster = subscribe(b2, topic);
        b2.send("/app/voice.join", Map.of("channelId", voice.getId().toString(), "state", Map.of()));
        Map<String, Object> last = next(b2Roster, "roster");
        assertEquals(1, ((List<?>) last.get("participants")).size(), "alice saiu; só bob na sala");
        b2.disconnect();
    }

    private AuthRequest cred(String username) {
        AuthRequest r = new AuthRequest();
        r.setUsername(username);
        r.setPassword("senhaSegura123");
        return r;
    }

    private ServerRequest serverReq(String name) {
        ServerRequest r = new ServerRequest();
        r.setName(name);
        return r;
    }

    private void authenticateAs(String username) {
        var details = userService.loadUserByUsername(username);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
    }
}
