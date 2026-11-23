package com.api.Razzacord.controller;

import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.User;
import com.api.Razzacord.security.PermissionService;
import com.api.Razzacord.repository.ChannelRepository;
import com.api.Razzacord.security.AccessService;
import com.api.Razzacord.voice.VoiceMessages;
import com.api.Razzacord.voice.VoiceRoomRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Controller;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Sinalização de voz. A identidade vem sempre do JWT (Principal), nunca do payload, e os sinais
 * de WebRTC (offer/answer/ice) vão só para o destinatário em /user/queue/voice.
 * A lista de participantes é publicada pelo servidor em /topic/voice/{canal}.
 */
@Slf4j
@Controller
public class VoiceWsController {

        private static final Set<String> SIGNAL_TYPES = Set.of("offer", "answer", "ice-candidate");

    private final SimpMessagingTemplate messagingTemplate;
    private final AccessService accessService;
    private final VoiceRoomRegistry registry;
    private final ChannelRepository channelRepository;
    private final PermissionService permissionService;
    private final ThreadPoolTaskScheduler scheduler;
    private final long disconnectGraceMs;

    public VoiceWsController(SimpMessagingTemplate messagingTemplate,
                             AccessService accessService,
                             VoiceRoomRegistry registry,
                             ChannelRepository channelRepository,
                             PermissionService permissionService,
                             ThreadPoolTaskScheduler brokerHeartbeatScheduler,
                             @Value("${app.voice.disconnect-grace-ms:8000}") long disconnectGraceMs) {
        this.messagingTemplate = messagingTemplate;
        this.accessService = accessService;
        this.registry = registry;
        this.channelRepository = channelRepository;
        this.permissionService = permissionService;
        this.scheduler = brokerHeartbeatScheduler;
        this.disconnectGraceMs = disconnectGraceMs;
    }

    @MessageMapping("/voice.join")
    public void join(@Payload VoiceMessages.Join msg, Principal principal, SimpMessageHeaderAccessor headers) {
        User user = accessService.userByPrincipal(principal.getName());
        if (msg.getChannelId() == null) throw ApiException.badRequest("channelId obrigatório");
        accessService.requireVoiceChannelMember(msg.getChannelId(), user);

        Set<UUID> changed = registry.join(msg.getChannelId(), user.getId(), user.getUsername(),
                user.getAvatarUrl(), headers.getSessionId(),
                stateForUser(msg.getChannelId(), user, msg.getState()));
        changed.forEach(this::broadcastRoster);
    }

    @MessageMapping("/voice.leave")
    public void leave(@Payload VoiceMessages.Leave msg, Principal principal) {
        User user = accessService.userByPrincipal(principal.getName());
        registry.leave(user.getId()).forEach(this::broadcastRoster);
    }

    @MessageMapping("/voice.state")
    public void state(@Payload VoiceMessages.StateUpdate msg, Principal principal) {
        User user = accessService.userByPrincipal(principal.getName());
        if (msg.getChannelId() != null && registry.updateState(msg.getChannelId(), user.getId(),
                stateForUser(msg.getChannelId(), user, msg.getState()))) {
            broadcastRoster(msg.getChannelId());
        }
    }

    @MessageMapping("/voice.signal")
    public void signal(@Payload VoiceMessages.Signal msg, Principal principal) {
        User sender = accessService.userByPrincipal(principal.getName());
        if (msg.getChannelId() == null || msg.getTargetId() == null
                || msg.getType() == null || !SIGNAL_TYPES.contains(msg.getType())) {
            return;
        }
        // Os dois lados precisam estar na mesma sala; evita usar o servidor como relay para qualquer um.
        VoiceRoomRegistry.Participant target = registry.get(msg.getChannelId(), msg.getTargetId());
        if (target == null || !registry.isInRoom(msg.getChannelId(), sender.getId())) {
            return;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", msg.getType());
        payload.put("channelId", msg.getChannelId().toString());
        payload.put("senderId", sender.getId().toString());
        payload.put("data", msg.getData());
        messagingTemplate.convertAndSendToUser(target.userId.toString(), "/queue/voice", payload);
    }

    /** Moderação de voz: silenciar ou desconectar alguém da sala. Sem permissão/hierarquia, ignora em silêncio. */
    @MessageMapping("/voice.moderate")
    public void moderate(@Payload VoiceMessages.Moderate msg, Principal principal) {
        User actor = accessService.userByPrincipal(principal.getName());
        if (msg.getChannelId() == null || msg.getTargetId() == null || msg.getAction() == null) return;
        boolean mute = "mute".equals(msg.getAction());
        if (!mute && !"disconnect".equals(msg.getAction())) return;
        UUID channelId = msg.getChannelId();
        UUID targetId = msg.getTargetId();
        UUID serverId = channelRepository.findById(channelId).map(c -> c.getServerId()).orElse(null);
        if (serverId == null) return;
        if (!permissionService.has(serverId, actor.getId(), Permission.MUTE_MEMBERS)) return;
        if (!registry.isInRoom(channelId, targetId) || !registry.isInRoom(channelId, actor.getId())) return;
        if (permissionService.isOwner(serverId, targetId)
                || permissionService.topPosition(serverId, targetId) >= permissionService.topPosition(serverId, actor.getId())) {
            return;
        }

        if (mute) {
            registry.updateState(channelId, targetId, Map.of("isMuted", true));
            broadcastRoster(channelId);
        } else {
            registry.leave(targetId).forEach(this::broadcastRoster);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "moderate");
        payload.put("action", msg.getAction());
        payload.put("channelId", channelId.toString());
        messagingTemplate.convertAndSendToUser(targetId.toString(), "/queue/voice", payload);
    }

    /** Sem STREAM, câmera e tela são forçadas para desligado (sobrescreve um "ligado" anterior no registro). */
    private Map<String, Object> stateForUser(UUID channelId, User user, Map<String, Object> state) {
        if (state == null) return null;
        UUID serverId = channelRepository.findById(channelId).map(c -> c.getServerId()).orElse(null);
        if (serverId != null && permissionService.has(serverId, user.getId(), Permission.STREAM)) return state;
        Map<String, Object> copy = new LinkedHashMap<>(state);
        copy.put("isCameraOn", false);
        copy.put("isSharingScreen", false);
        copy.put("cameraStreamId", null);
        copy.put("screenStreamId", null);
        return copy;
    }

    /**
     * Queda de conexão: espera uma janela curta antes de remover da sala. Se o cliente reconectar e entrar
     * de novo (nova sessão), a remoção não faz nada e os pares WebRTC existentes não são derrubados.
     */
    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        Runnable cleanup = () -> registry.leaveBySession(sessionId).forEach(this::broadcastRoster);
        if (disconnectGraceMs <= 0) {
            cleanup.run();
        } else {
            scheduler.schedule(cleanup, Instant.now().plusMillis(disconnectGraceMs));
        }
    }

    /** Tira o usuário da sala de voz de um canal deste servidor (ex.: ao ser expulso), atualizando os rosters. */
    public void kickFromVoice(UUID serverId, UUID userId) {
        List<UUID> channels = channelRepository.findByServerId(serverId).stream()
                .map(c -> c.getId())
                .filter(id -> registry.isInRoom(id, userId))
                .toList();
        if (channels.isEmpty()) return;
        // Avisa o cliente antes: ele precisa largar a chamada (inclusive o SFU), não só sumir do roster.
        for (UUID channelId : channels) {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "moderate");
            payload.put("action", "disconnect");
            payload.put("channelId", channelId.toString());
            messagingTemplate.convertAndSendToUser(userId.toString(), "/queue/voice", payload);
        }
        registry.leave(userId).forEach(this::broadcastRoster);
    }

    private void broadcastRoster(UUID channelId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "roster");
        payload.put("channelId", channelId.toString());
        payload.put("participants", registry.roster(channelId));
        messagingTemplate.convertAndSend("/topic/voice/" + channelId, payload);

        // Presença resumida para a lista de canais de quem está no servidor (sem estado de mídia).
        channelRepository.findById(channelId).ifPresent(channel -> {
            Map<String, Object> presence = new LinkedHashMap<>();
            presence.put("channelId", channelId.toString());
            presence.put("users", registry.presence(channelId));
            messagingTemplate.convertAndSend("/topic/servers/" + channel.getServerId() + "/voice", presence);
        });
    }
}
