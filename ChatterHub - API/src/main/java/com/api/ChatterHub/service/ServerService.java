package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.CreateServerRequest;
import com.api.ChatterHub.dto.ServerDTO;
import com.api.ChatterHub.model.Channel;
import com.api.ChatterHub.model.ChannelType;
import com.api.ChatterHub.model.Server;
import com.api.ChatterHub.repository.ChannelRepository;
import com.api.ChatterHub.repository.ServerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ServerService {

    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;

    public List<ServerDTO> findAll() {
        return serverRepository.findAll().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public ServerDTO findById(String id) {
        Server server = serverRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Servidor não encontrado: " + id));
        return toDTO(server);
    }

    @Transactional
    public ServerDTO createServer(CreateServerRequest request) {
        Server server = Server.builder()
                .name(request.getName())
                .iconUrl(request.getIconUrl())
                .build();

        Server saved = serverRepository.save(server);

        // Criar canais padrão ("geral" texto e "Geral" voz)
        Channel generalText = Channel.builder()
                .name("geral")
                .type(ChannelType.TEXT)
                .server(saved)
                .build();
        channelRepository.save(generalText);

        Channel generalVoice = Channel.builder()
                .name("Geral")
                .type(ChannelType.VOICE)
                .server(saved)
                .build();
        channelRepository.save(generalVoice);

        return toDTO(saved);
    }

    public ServerDTO toDTO(Server server) {
        return ServerDTO.builder()
                .id(server.getId())
                .name(server.getName())
                .iconUrl(server.getIconUrl())
                .initials(server.getInitials())
                .build();
    }
}
