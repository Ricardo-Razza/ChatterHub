package com.api.Razzacord.voice;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Entrega STUN e TURN. O TURN usa credenciais efêmeras no formato do coturn
 * (use-auth-secret): username = expiração:usuário, credential = HMAC-SHA1 em base64.
 */
@Service
public class IceConfigService {

    private final List<String> stunUrls;
    private final List<String> turnUrls;
    private final String turnSecret;
    private final long ttlSeconds;

    public IceConfigService(@Value("${app.stun.urls:}") String stun,
                            @Value("${app.turn.urls:}") String turn,
                            @Value("${app.turn.secret:}") String turnSecret,
                            @Value("${app.turn.ttl-seconds:86400}") long ttlSeconds) {
        this.stunUrls = split(stun);
        this.turnUrls = split(turn);
        this.turnSecret = turnSecret;
        this.ttlSeconds = ttlSeconds;
    }

    public List<Map<String, Object>> iceServersFor(String userId) {
        List<Map<String, Object>> servers = new ArrayList<>();
        if (!stunUrls.isEmpty()) {
            servers.add(Map.of("urls", stunUrls));
        }
        if (!turnUrls.isEmpty() && !turnSecret.isBlank()) {
            long expires = System.currentTimeMillis() / 1000 + ttlSeconds;
            String username = expires + ":" + userId;
            Map<String, Object> turn = new LinkedHashMap<>();
            turn.put("urls", turnUrls);
            turn.put("username", username);
            turn.put("credential", hmacSha1(username));
            servers.add(turn);
        }
        return servers;
    }

    private String hmacSha1(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(turnSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao gerar credencial TURN", e);
        }
    }

    private static List<String> split(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
