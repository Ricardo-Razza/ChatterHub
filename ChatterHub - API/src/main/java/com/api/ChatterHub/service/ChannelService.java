package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.ChannelDTO;
import com.api.ChatterHub.dto.CreateChannelRequest;
import com.api.ChatterHub.model.Channel;
import com.api.ChatterHub.model.Server;
import com.api.ChatterHub.repository.ChannelRepository;
import com.api.ChatterHub.repository.ServerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChannelService {

    private final ChannelRepository channelRepository;
    private final ServerRepository serverRepository;

    public List<ChannelDTO> findByServerId(String serverId) {
        return channelRepository.findByServerId(serverId).stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public ChannelDTO findById(String id) {
        Channel channel = channelRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Canal não encontrado: " + id));
        return toDTO(channel);
    }

    @Transactional
    public ChannelDTO createChannel(CreateChannelRequest request) {
        Server server = serverRepository.findById(request.getServerId())
                .orElseThrow(() -> new RuntimeException("Servidor não encontrado: " + request.getServerId()));

        Channel channel = Channel.builder()
                .name(request.getName())
                .type(request.getType())
                .server(server)
                .build();

        Channel saved = channelRepository.save(channel);
        return toDTO(saved);
    }

    public ChannelDTO toDTO(Channel channel) {
        return ChannelDTO.builder()
                .id(channel.getId())
                .serverId(channel.getServer().getId())
                .name(channel.getName())
                .type(channel.getType())
                .connectedUserIds(new ArrayList<>())
                .build();
    }
}
