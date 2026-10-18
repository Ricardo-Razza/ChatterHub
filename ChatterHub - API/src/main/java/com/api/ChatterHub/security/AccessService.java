package com.api.ChatterHub.security;

import com.api.ChatterHub.exception.ApiException;
import com.api.ChatterHub.model.Channel;
import com.api.ChatterHub.model.ChannelType;
import com.api.ChatterHub.model.Role;
import com.api.ChatterHub.model.Server;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.ChannelRepository;
import com.api.ChatterHub.repository.ServerMemberRepository;
import com.api.ChatterHub.repository.ServerRepository;
import com.api.ChatterHub.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Regras de autorização reutilizadas por REST e STOMP. */
@Service
@RequiredArgsConstructor
public class AccessService {

    private final ChannelRepository channelRepository;
    private final ServerRepository serverRepository;
    private final ServerMemberRepository serverMemberRepository;
    private final UserRepository userRepository;

    /** O Principal do STOMP é o id do usuário (subject do JWT). */
    public User userByPrincipal(String principalName) {
        try {
            return userRepository.findById(UUID.fromString(principalName))
                    .orElseThrow(() -> ApiException.forbidden("Usuário não encontrado"));
        } catch (IllegalArgumentException e) {
            throw ApiException.forbidden("Identidade inválida");
        }
    }

    public boolean isMember(UUID serverId, UUID userId) {
        return serverMemberRepository.findByServerIdAndUserId(serverId, userId).isPresent();
    }

    public boolean isPrivileged(User user) {
        return user.getRole() == Role.ADMIN || user.getRole() == Role.MODERATOR;
    }

    public Channel requireChannelMember(UUID channelId, User user) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> ApiException.notFound("Canal não encontrado"));
        if (!isMember(channel.getServerId(), user.getId())) {
            throw ApiException.forbidden("Você não é membro deste servidor");
        }
        return channel;
    }

    public Channel requireVoiceChannelMember(UUID channelId, User user) {
        Channel channel = requireChannelMember(channelId, user);
        if (channel.getType() != ChannelType.VOICE) {
            throw ApiException.badRequest("Este não é um canal de voz");
        }
        return channel;
    }

    public void requireServerMember(UUID serverId, User user) {
        if (!isMember(serverId, user.getId())) {
            throw ApiException.forbidden("Você não é membro deste servidor");
        }
    }

    public Server requireServerOwnerOrAdmin(UUID serverId, User user) {
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> ApiException.notFound("Servidor não encontrado"));
        boolean owner = server.getOwnerId().equals(user.getId());
        if (!owner && user.getRole() != Role.ADMIN) {
            throw ApiException.forbidden("Apenas o dono do servidor pode fazer isso");
        }
        return server;
    }

    /** Dono do servidor ou moderador global podem moderar mensagens de outros. */
    public boolean canModerate(UUID serverId, User user) {
        if (isPrivileged(user)) return true;
        return serverRepository.findById(serverId)
                .map(s -> s.getOwnerId().equals(user.getId()))
                .orElse(false);
    }
}
