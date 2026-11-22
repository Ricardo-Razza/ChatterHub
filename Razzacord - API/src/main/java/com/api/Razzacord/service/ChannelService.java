package com.api.Razzacord.service;

import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ChannelResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Channel;
import com.api.Razzacord.model.ChannelType;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.repository.ChannelRepository;
import com.api.Razzacord.repository.ServerRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ChannelService {

    @Autowired private ChannelRepository channelRepository;
    @Autowired private ServerRepository serverRepository;
    @Autowired private ServerEventPublisher eventPublisher;
    @Autowired @Lazy private MessageService messageService;

    public List<ChannelResponse> getChannelsByServer(UUID serverId) {
        return orderedChannels(serverId).stream().map(this::mapToChannelResponse).toList();
    }

    public UUID getServerId(UUID channelId) {
        return requireChannel(channelId).getServerId();
    }

    @Transactional
    public ChannelResponse createChannel(ChannelRequest request) {
        UUID serverId = request.getServerId();
        if (serverId == null) throw ApiException.badRequest("serverId obrigatório");
        lockServer(serverId);
        int position = orderedChannels(serverId).stream().mapToInt(Channel::getPosition).max().orElse(-1) + 1;
        Channel channel = Channel.builder().serverId(serverId).position(position).build();
        applyDetails(channel, request);
        channel = channelRepository.save(channel);
        publishChange(serverId);
        return mapToChannelResponse(channel);
    }

    @Transactional
    public ChannelResponse updateChannel(UUID serverId, UUID id, ChannelRequest request) {
        lockServer(serverId);
        Channel channel = requireChannel(id);
        applyDetails(channel, request);
        publishChange(serverId);
        return mapToChannelResponse(channel);
    }

    @Transactional
    public List<ChannelResponse> reorderChannels(UUID serverId, List<UUID> ids) {
        lockServer(serverId);
        Map<UUID, Channel> channels = orderedChannels(serverId).stream()
                .collect(Collectors.toMap(Channel::getId, Function.identity()));
        if (ids == null || ids.size() != channels.size() || !channels.keySet().equals(new HashSet<>(ids))) {
            throw ApiException.badRequest("Informe todos os canais do servidor, sem repetições");
        }
        for (int index = 0; index < ids.size(); index++) {
            channels.get(ids.get(index)).setPosition(index);
        }
        publishChange(serverId);
        return ids.stream().map(channels::get).map(this::mapToChannelResponse).toList();
    }

    @Transactional
    public void deleteChannel(UUID serverId, UUID id) {
        Server server = lockServer(serverId);
        requireChannel(id);
        if (id.equals(server.getSystemChannelId())) {
            server.setSystemChannelId(null);
            eventPublisher.publish(server.getId(), Map.of("type", "server-updated"));
        }
        removeChannel(id);
        publishChange(server.getId());
    }

    @Transactional
    public void deleteChannelsByServerId(UUID serverId) {
        for (Channel channel : orderedChannels(serverId)) {
            removeChannel(channel.getId());
        }
    }

    public void requireSystemChannel(UUID serverId, UUID channelId) {
        boolean valid = channelRepository.findById(channelId)
                .filter(channel -> serverId.equals(channel.getServerId()) && channel.getType() != ChannelType.VOICE)
                .isPresent();
        if (!valid) throw ApiException.badRequest("Selecione um canal de texto deste servidor");
    }

    private void applyDetails(Channel channel, ChannelRequest request) {
        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty() || name.length() > 60) {
            throw ApiException.badRequest("O nome do canal deve ter entre 1 e 60 caracteres");
        }
        ChannelType type = channel.getType();
        if (request.getType() != null || type == null) {
            try {
                type = ChannelType.valueOf(String.valueOf(request.getType()).toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Tipo de canal inválido");
            }
        }
        if (channel.getType() != null && (channel.getType() == ChannelType.VOICE) != (type == ChannelType.VOICE)) {
            throw ApiException.badRequest("Canais de voz não podem mudar de tipo");
        }
        channel.setName(name);
        channel.setType(type);
        channel.setTopic(optionalText(request.getTopic(), 200, "O assunto"));
        channel.setCategory(optionalText(request.getCategory(), 60, "A categoria"));
    }

    private String optionalText(String value, int limit, String label) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        if (trimmed.length() > limit) {
            throw ApiException.badRequest(label + " deve ter até " + limit + " caracteres");
        }
        return trimmed;
    }

    private List<Channel> orderedChannels(UUID serverId) {
        return channelRepository.findByServerIdOrderByPositionAscCreatedAtAscIdAsc(serverId);
    }

    private Channel requireChannel(UUID id) {
        return channelRepository.findById(id).orElseThrow(() -> ApiException.notFound("Canal não encontrado"));
    }

    private Server lockServer(UUID serverId) {
        return serverRepository.lockById(serverId).orElseThrow(() -> ApiException.notFound("Servidor não encontrado"));
    }

    private void removeChannel(UUID id) {
        messageService.deleteMessagesByChannelId(id);
        channelRepository.deleteById(id);
    }

    private void publishChange(UUID serverId) {
        eventPublisher.publish(serverId, Map.of("type", "channels-updated"));
    }

    private ChannelResponse mapToChannelResponse(Channel channel) {
        return ChannelResponse.builder()
                .id(channel.getId())
                .serverId(channel.getServerId())
                .name(channel.getName())
                .type(channel.getType().name().toLowerCase(Locale.ROOT))
                .topic(channel.getTopic())
                .category(channel.getCategory())
                .position(channel.getPosition())
                .connectedUserIds(List.of())
                .build();
    }
}
