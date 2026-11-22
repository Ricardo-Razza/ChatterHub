package com.api.Razzacord.security;

import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Channel;
import com.api.Razzacord.model.ChannelType;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.ChannelRepository;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Regras de autorização reutilizadas por REST e STOMP. */
@Service
@RequiredArgsConstructor
public class AccessService {

    private final ChannelRepository channelRepository;
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
}
