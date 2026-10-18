package com.api.ChatterHub.service;

import org.springframework.security.authentication.LockedException;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Limita tentativas de login por IP + usuário (em memória; suficiente para uma instância). */
@Service
public class LoginAttemptService {

    private static final int MAX_ATTEMPTS = 5;
    private static final long WINDOW_MS = 5 * 60 * 1000L;

    private record Attempts(int count, long firstAt) {}

    private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();

    public void checkAllowed(String key) {
        Attempts a = attempts.get(key);
        if (a == null) return;
        if (System.currentTimeMillis() - a.firstAt() > WINDOW_MS) {
            attempts.remove(key);
            return;
        }
        if (a.count() >= MAX_ATTEMPTS) {
            throw new LockedException("Muitas tentativas de login. Tente novamente em alguns minutos.");
        }
    }

    public void recordFailure(String key) {
        long now = System.currentTimeMillis();
        attempts.merge(key, new Attempts(1, now), (old, ignored) ->
                now - old.firstAt() > WINDOW_MS ? new Attempts(1, now) : new Attempts(old.count() + 1, old.firstAt()));
        if (attempts.size() > 10_000) {
            attempts.entrySet().removeIf(e -> now - e.getValue().firstAt() > WINDOW_MS);
        }
    }

    public void recordSuccess(String key) {
        attempts.remove(key);
    }
}
