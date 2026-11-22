package com.api.Razzacord.service;

import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ChannelResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Channel;
import com.api.Razzacord.model.ChannelType;
import com.api.Razzacord.repository.ChannelRepository;
import com.api.Razzacord.repository.MessageRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ChannelService {

    @Autowired
    private ChannelRepository channelRepository;

    @Autowired
    @Lazy
    private MessageService messageService;

    public List<ChannelResponse> getChannelsByServer(UUID serverId) {
        return channelRepository.findByServerId(serverId).stream()
                .map(this::mapToChannelResponse)
                .collect(Collectors.toList());
    }

    public UUID getServerId(UUID channelId) {
        return channelRepository.findById(channelId)
                .orElseThrow(() -> ApiException.notFound("Canal não encontrado"))
                .getServerId();
    }

    public ChannelResponse createChannel(ChannelRequest request) {
        if (request.getServerId() == null) {
            throw ApiException.badRequest("serverId obrigatório");
        }
        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty() || name.length() > 60) {
            throw ApiException.badRequest("O nome do canal deve ter entre 1 e 60 caracteres");
        }
        ChannelType type;
        try {
            type = ChannelType.valueOf(String.valueOf(request.getType()).toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Tipo de canal inválido");
        }

        Channel channel = Channel.builder()
                .serverId(request.getServerId())
                .name(name)
                .type(type)
                .build();

        return mapToChannelResponse(channelRepository.save(channel));
    }

    @Transactional
    public void deleteChannel(UUID id) {
        messageService.deleteMessagesByChannelId(id);
        channelRepository.deleteById(id);
    }

    @Transactional
    public void deleteChannelsByServerId(UUID serverId) {
        List<Channel> channels = channelRepository.findByServerId(serverId);
        for (Channel channel : channels) {
            deleteChannel(channel.getId());
        }
    }

    private ChannelResponse mapToChannelResponse(Channel channel) {
        return ChannelResponse.builder()
                .id(channel.getId())
                .serverId(channel.getServerId())
                .name(channel.getName())
                .type(channel.getType().name().toLowerCase())
                .connectedUserIds(new ArrayList<>())
                .build();
    }
}
