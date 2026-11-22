package com.api.Razzacord.config;

import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.User;
import com.api.Razzacord.security.AccessService;
import com.api.Razzacord.service.JwtService;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Autentica o CONNECT com o JWT e aplica "deny by default" em SUBSCRIBE/SEND.
 * Sem isso qualquer cliente podia assinar tópicos de outros canais, se passar por
 * outro usuário e publicar direto nos tópicos do broker.
 */
@Component
public class StompAuthInterceptor implements ChannelInterceptor {

    private static final String UUID_RE = "([0-9a-fA-F\\-]{36})";
    private static final Pattern VOICE_TOPIC = Pattern.compile("^/topic/voice/" + UUID_RE + "$");
    private static final Pattern CHANNEL_TOPIC = Pattern.compile("^/topic/channels/" + UUID_RE + "(/events)?$");
    private static final Pattern SERVER_VOICE_TOPIC = Pattern.compile("^/topic/servers/" + UUID_RE + "/voice$");
    private static final Pattern DM_TOPIC = Pattern.compile("^/topic/dm/" + UUID_RE + "$");

    private final JwtService jwtService;
    private final AccessService accessService;

    public StompAuthInterceptor(JwtService jwtService, AccessService accessService) {
        this.jwtService = jwtService;
        this.accessService = accessService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();

        if (StompCommand.CONNECT.equals(command)) {
            String userId = authenticate(accessor);
            accessor.setUser(new UsernamePasswordAuthenticationToken(userId, null, List.of()));
            return message;
        }

        if (StompCommand.SUBSCRIBE.equals(command)) {
            User user = currentUser(accessor);
            authorizeSubscription(accessor.getDestination(), user);
        } else if (StompCommand.SEND.equals(command)) {
            currentUser(accessor);
            String destination = accessor.getDestination();
            // Clientes só podem falar com @MessageMapping; publicar direto em /topic burlaria toda a validação.
            if (destination == null || !destination.startsWith("/app/")) {
                throw new MessagingException("Destino de envio não permitido");
            }
        }
        return message;
    }

    private String authenticate(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new MessagingException("Token ausente");
        }
        String userId = jwtService.parseSubject(header.substring(7))
                .orElseThrow(() -> new MessagingException("Token inválido ou expirado"));
        try {
            accessService.userByPrincipal(userId);
        } catch (ApiException e) {
            throw new MessagingException("Usuário inválido");
        }
        return userId;
    }

    private User currentUser(StompHeaderAccessor accessor) {
        if (!(accessor.getUser() instanceof Authentication auth) || auth.getName() == null) {
            throw new MessagingException("Não autenticado");
        }
        return accessService.userByPrincipal(auth.getName());
    }

    private void authorizeSubscription(String destination, User user) {
        if (destination == null) {
            throw new MessagingException("Destino ausente");
        }
        if (destination.startsWith("/user/queue/")) {
            return; // entregas dirigidas: o broker já resolve por usuário
        }

        Matcher m = VOICE_TOPIC.matcher(destination);
        if (m.matches()) {
            accessService.requireVoiceChannelMember(UUID.fromString(m.group(1)), user);
            return;
        }

        m = CHANNEL_TOPIC.matcher(destination);
        if (m.matches()) {
            accessService.requireChannelMember(UUID.fromString(m.group(1)), user);
            return;
        }

        m = SERVER_VOICE_TOPIC.matcher(destination);
        if (m.matches()) {
            accessService.requireServerMember(UUID.fromString(m.group(1)), user);
            return;
        }

        m = DM_TOPIC.matcher(destination);
        if (m.matches() && user.getId().equals(UUID.fromString(m.group(1)))) {
            return;
        }

        throw new MessagingException("Assinatura não permitida: " + destination);
    }
}
