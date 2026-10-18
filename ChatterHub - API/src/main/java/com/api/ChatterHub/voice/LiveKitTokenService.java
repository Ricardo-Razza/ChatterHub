package com.api.ChatterHub.voice;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;
import java.util.Optional;

/**
 * Emite tokens de acesso do LiveKit (SFU). Um token libera uma sala (= canal de voz) para um usuário.
 * Sem LiveKit configurado o cliente cai na malha P2P.
 */
@Service
public class LiveKitTokenService {

    private final String url;
    private final String apiKey;
    private final String apiSecret;
    private final long ttlSeconds;

    public LiveKitTokenService(@Value("${app.livekit.url:}") String url,
                               @Value("${app.livekit.api-key:}") String apiKey,
                               @Value("${app.livekit.api-secret:}") String apiSecret,
                               @Value("${app.livekit.ttl-seconds:7200}") long ttlSeconds) {
        this.url = url;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.ttlSeconds = ttlSeconds;
        if (isEnabled() && apiSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("LIVEKIT_API_SECRET precisa ter pelo menos 32 caracteres");
        }
    }

    public boolean isEnabled() {
        return !url.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
    }

    public Optional<Map<String, String>> tokenFor(String roomName, String identity, String displayName) {
        if (!isEnabled()) return Optional.empty();
        long now = System.currentTimeMillis();
        Map<String, Object> video = Map.of(
                "room", roomName,
                "roomJoin", true,
                "canPublish", true,
                "canSubscribe", true,
                "canPublishData", false);
        String token = Jwts.builder()
                .issuer(apiKey)
                .subject(identity)
                .claim("name", displayName)
                .claim("video", video)
                .notBefore(new Date(now - 10_000))
                .expiration(new Date(now + ttlSeconds * 1000))
                .signWith(Keys.hmacShaKeyFor(apiSecret.getBytes(StandardCharsets.UTF_8)))
                .compact();
        return Optional.of(Map.of("url", url, "token", token));
    }
}
