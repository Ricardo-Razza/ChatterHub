package com.api.Razzacord;

import com.api.Razzacord.voice.IceConfigService;
import com.api.Razzacord.voice.VoiceRoomRegistry;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class VoiceUnitTests {

    @Test
    void userIsInOnlyOneRoomAtATime() {
        VoiceRoomRegistry reg = new VoiceRoomRegistry();
        UUID u = UUID.randomUUID(), c1 = UUID.randomUUID(), c2 = UUID.randomUUID();

        reg.join(c1, u, "u", "", "s1", Map.of());
        Set<UUID> changed = reg.join(c2, u, "u", "", "s1", Map.of());

        assertEquals(Set.of(c1, c2), changed);
        assertTrue(reg.roster(c1).isEmpty());
        assertEquals(1, reg.roster(c2).size());
    }

    @Test
    void staleSessionDoesNotEvictNewerSession() {
        VoiceRoomRegistry reg = new VoiceRoomRegistry();
        UUID u = UUID.randomUUID(), c = UUID.randomUUID();

        reg.join(c, u, "u", "", "old-session", Map.of());
        reg.join(c, u, "u", "", "new-session", Map.of());

        assertTrue(reg.leaveBySession("old-session").isEmpty());
        assertTrue(reg.isInRoom(c, u));
        assertEquals(Set.of(c), reg.leaveBySession("new-session"));
        assertFalse(reg.isInRoom(c, u));
    }

    @Test
    void stateIsWhitelistedAndTyped() {
        VoiceRoomRegistry reg = new VoiceRoomRegistry();
        UUID u = UUID.randomUUID(), c = UUID.randomUUID();
        reg.join(c, u, "u", "", "s", Map.of("isMuted", "yes", "unknown", true, "isDeafened", true));

        Map<String, Object> state = reg.get(c, u).state;
        assertEquals(Map.of("isDeafened", true), state);
    }

    @Test
    void turnCredentialsFollowCoturnRestFormat() throws Exception {
        IceConfigService svc = new IceConfigService("stun:s.example:3478", "turn:t.example:3478", "segredo", 3600);
        List<Map<String, Object>> servers = svc.iceServersFor("user-1");

        assertEquals(2, servers.size());
        Map<String, Object> turn = servers.get(1);
        String username = (String) turn.get("username");
        assertTrue(username.endsWith(":user-1"));

        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec("segredo".getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String expected = Base64.getEncoder().encodeToString(mac.doFinal(username.getBytes(StandardCharsets.UTF_8)));
        assertEquals(expected, turn.get("credential"));
    }

    @Test
    void liveKitTokenCarriesRoomGrantAndIsSignedWithTheSecret() {
        String secret = "0123456789abcdef0123456789abcdef0123";
        var svc = new com.api.Razzacord.voice.LiveKitTokenService("ws://lk:7880", "devkey", secret, 600);
        var out = svc.tokenFor("room-1", "user-1", "Alice", true).orElseThrow();

        var claims = io.jsonwebtoken.Jwts.parser()
                .verifyWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(out.get("token")).getPayload();

        assertEquals("devkey", claims.getIssuer());
        assertEquals("user-1", claims.getSubject());
        Map<?, ?> video = claims.get("video", Map.class);
        assertEquals("room-1", video.get("room"));
        assertEquals(true, video.get("roomJoin"));
        assertEquals("ws://lk:7880", out.get("url"));
        assertFalse(video.containsKey("canPublishSources"));
    }

    @Test
    void tokenWithoutStreamLimitsSourcesToMicrophone() {
        String secret = "0123456789abcdef0123456789abcdef0123";
        var svc = new com.api.Razzacord.voice.LiveKitTokenService("ws://lk:7880", "devkey", secret, 600);
        var out = svc.tokenFor("room-1", "user-1", "Alice", false).orElseThrow();
        var claims = io.jsonwebtoken.Jwts.parser()
                .verifyWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(out.get("token")).getPayload();
        Map<?, ?> video = claims.get("video", Map.class);
        assertEquals(java.util.List.of("microphone"), video.get("canPublishSources"));
    }

    @Test
    void liveKitDisabledWithoutConfigAndRejectsWeakSecret() {
        assertTrue(new com.api.Razzacord.voice.LiveKitTokenService("", "", "", 600).tokenFor("r", "u", "n", true).isEmpty());
        assertThrows(IllegalStateException.class,
                () -> new com.api.Razzacord.voice.LiveKitTokenService("ws://x", "k", "curto", 600));
    }

    @Test
    void withoutTurnSecretOnlyStunIsReturned() {
        IceConfigService svc = new IceConfigService("stun:s.example:3478", "turn:t.example:3478", "", 3600);
        assertEquals(1, svc.iceServersFor("x").size());
    }
}
