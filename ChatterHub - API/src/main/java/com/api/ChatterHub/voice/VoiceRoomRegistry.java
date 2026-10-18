package com.api.ChatterHub.voice;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fonte única da verdade de quem está em cada sala de voz. Antes a presença existia só nos
 * clientes, então quem caía sem enviar "leave" ficava como fantasma para todos.
 * Um usuário só pode estar em uma sala por vez (como no Discord).
 */
@Component
public class VoiceRoomRegistry {

    private static final Set<String> BOOLEAN_STATE_KEYS = Set.of(
            "isMuted", "isDeafened", "isCameraOn", "isSharingScreen", "isSpeaking");
    private static final Set<String> STRING_STATE_KEYS = Set.of("micStreamId", "screenStreamId", "cameraStreamId");

    public static final class Participant {
        public final UUID userId;
        public final String username;
        public final String avatarUrl;
        public final String sessionId;
        public final Map<String, Object> state = new LinkedHashMap<>();

        Participant(UUID userId, String username, String avatarUrl, String sessionId) {
            this.userId = userId;
            this.username = username;
            this.avatarUrl = avatarUrl;
            this.sessionId = sessionId;
        }

        public Map<String, Object> toView() {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("userId", userId.toString());
            view.put("username", username);
            view.put("avatarUrl", avatarUrl);
            view.put("state", new LinkedHashMap<>(state));
            return view;
        }
    }

    /** channelId -> (userId -> participante) */
    private final Map<UUID, Map<UUID, Participant>> rooms = new ConcurrentHashMap<>();

    /** Entra na sala e devolve todos os canais cuja lista mudou (a sala nova e a que o usuário deixou). */
    public synchronized Set<UUID> join(UUID channelId, UUID userId, String username, String avatarUrl,
                                       String sessionId, Map<String, Object> state) {
        Set<UUID> changed = new HashSet<>(removeUser(userId));
        Participant p = new Participant(userId, username, avatarUrl, sessionId);
        p.state.putAll(sanitize(state));
        rooms.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>()).put(userId, p);
        changed.add(channelId);
        return changed;
    }

    public synchronized Set<UUID> leave(UUID userId) {
        return removeUser(userId);
    }

    /** Remove o usuário só se a sessão for a que o registrou (evita aba antiga derrubar a nova). */
    public synchronized Set<UUID> leaveBySession(String sessionId) {
        Set<UUID> changed = new HashSet<>();
        for (Map.Entry<UUID, Map<UUID, Participant>> room : rooms.entrySet()) {
            boolean removed = room.getValue().values().removeIf(p -> p.sessionId.equals(sessionId));
            if (removed) changed.add(room.getKey());
        }
        rooms.values().removeIf(Map::isEmpty);
        return changed;
    }

    public synchronized boolean updateState(UUID channelId, UUID userId, Map<String, Object> patch) {
        Participant p = get(channelId, userId);
        if (p == null) return false;
        p.state.putAll(sanitize(patch));
        return true;
    }

    public Participant get(UUID channelId, UUID userId) {
        Map<UUID, Participant> room = rooms.get(channelId);
        return room == null ? null : room.get(userId);
    }

    public boolean isInRoom(UUID channelId, UUID userId) {
        return get(channelId, userId) != null;
    }

    public List<Map<String, Object>> roster(UUID channelId) {
        Map<UUID, Participant> room = rooms.get(channelId);
        List<Map<String, Object>> list = new ArrayList<>();
        if (room != null) {
            room.values().forEach(p -> list.add(p.toView()));
        }
        return list;
    }

    /** Só quem está na sala (id, nome, avatar), para a lista de canais. */
    public List<Map<String, Object>> presence(UUID channelId) {
        List<Map<String, Object>> list = new ArrayList<>();
        Map<UUID, Participant> room = rooms.get(channelId);
        if (room != null) {
            room.values().forEach(p -> {
                Map<String, Object> u = new LinkedHashMap<>();
                u.put("userId", p.userId.toString());
                u.put("username", p.username);
                u.put("avatarUrl", p.avatarUrl);
                list.add(u);
            });
        }
        return list;
    }

    private Set<UUID> removeUser(UUID userId) {
        Set<UUID> changed = new HashSet<>();
        for (Map.Entry<UUID, Map<UUID, Participant>> room : rooms.entrySet()) {
            if (room.getValue().remove(userId) != null) changed.add(room.getKey());
        }
        rooms.values().removeIf(Map::isEmpty);
        return changed;
    }

    /** Só aceita chaves conhecidas e tipos esperados: o estado é repassado a todos os participantes. */
    private Map<String, Object> sanitize(Map<String, Object> raw) {
        Map<String, Object> clean = new LinkedHashMap<>();
        if (raw == null) return clean;
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Object v = e.getValue();
            if (BOOLEAN_STATE_KEYS.contains(e.getKey()) && v instanceof Boolean) {
                clean.put(e.getKey(), v);
            } else if (STRING_STATE_KEYS.contains(e.getKey())) {
                if (v == null) {
                    clean.put(e.getKey(), null);
                } else if (v instanceof String s && s.length() <= 80) {
                    clean.put(e.getKey(), s);
                }
            }
        }
        return clean;
    }
}
