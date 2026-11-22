package com.api.Razzacord.service;

import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ServerRequest;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.dto.UserResponse;
import com.api.Razzacord.model.ChannelType;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerMember;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerRepository;
import com.api.Razzacord.repository.UserRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ServerService {

    @Autowired
    private ServerRepository serverRepository;

    @Autowired
    private ServerMemberRepository serverMemberRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private com.api.Razzacord.repository.ServerInviteRepository serverInviteRepository;

    @Autowired
    private ChannelService channelService;

    @Autowired
    private UserRepository userRepository;

    public List<ServerResponse> getServersForCurrentUser() {
        User currentUser = userService.getCurrentUserModel();
        List<ServerMember> memberships = serverMemberRepository.findByUserId(currentUser.getId());
        
        return memberships.stream()
                .map(member -> serverRepository.findById(member.getServerId()).orElse(null))
                .filter(server -> server != null)
                .map(this::mapToServerResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ServerResponse createServer(ServerRequest request) {
        User currentUser = userService.getCurrentUserModel();

        if (request.getName() == null || request.getName().isBlank() || request.getName().length() > 60) {
            throw com.api.Razzacord.exception.ApiException.badRequest("O nome do servidor deve ter entre 1 e 60 caracteres");
        }

        String initials = "";
        if (request.getName() != null && !request.getName().isEmpty()) {
            String[] words = request.getName().split(" ");
            for (int i = 0; i < Math.min(words.length, 2); i++) {
                if (!words[i].isEmpty()) {
                    initials += words[i].substring(0, 1).toUpperCase();
                }
            }
        }

        Server server = Server.builder()
                .name(request.getName())
                .iconUrl(request.getIconUrl())
                .initials(initials)
                .ownerId(currentUser.getId())
                .build();

        server = serverRepository.save(server);

        ServerMember member = ServerMember.builder()
                .serverId(server.getId())
                .userId(currentUser.getId())
                .build();
        serverMemberRepository.save(member);

        ChannelRequest textChannel = new ChannelRequest();
        textChannel.setName("geral");
        textChannel.setType("TEXT");
        textChannel.setServerId(server.getId());
        channelService.createChannel(textChannel);

        ChannelRequest voiceChannel = new ChannelRequest();
        voiceChannel.setName("Sala Geral");
        voiceChannel.setType("VOICE");
        voiceChannel.setServerId(server.getId());
        channelService.createChannel(voiceChannel);

        return mapToServerResponse(server);
    }

    @Transactional
    public void deleteServer(UUID id) {
        User currentUser = userService.getCurrentUserModel();
        Server server = serverRepository.findById(id)
                .orElseThrow(() -> com.api.Razzacord.exception.ApiException.notFound("Servidor não encontrado"));

        if (!server.getOwnerId().equals(currentUser.getId())) {
            throw com.api.Razzacord.exception.ApiException.forbidden("Apenas o dono pode apagar o servidor");
        }

        serverInviteRepository.deleteByServerId(id);
        serverMemberRepository.deleteByServerId(id);
        channelService.deleteChannelsByServerId(id);
        serverRepository.deleteById(id);
    }

    public void leaveServer(UUID serverId) {
        User currentUser = userService.getCurrentUserModel();
        ServerMember member = serverMemberRepository.findByServerIdAndUserId(serverId, currentUser.getId())
                .orElseThrow(() -> com.api.Razzacord.exception.ApiException.badRequest("Você não está neste servidor"));

        Server server = serverRepository.findById(serverId).orElse(null);
        if (server != null && server.getOwnerId().equals(currentUser.getId())) {
            throw com.api.Razzacord.exception.ApiException.badRequest("O dono não pode sair; apague o servidor");
        }

        serverMemberRepository.delete(member);
    }

    public List<UserResponse> getServerMembers(UUID serverId) {
        if (serverMemberRepository.findByServerIdAndUserId(serverId, userService.getCurrentUserModel().getId()).isEmpty()) {
            throw com.api.Razzacord.exception.ApiException.forbidden("Você não é membro deste servidor");
        }
        List<ServerMember> memberships = serverMemberRepository.findByServerId(serverId);
        return memberships.stream()
                .map(m -> userRepository.findById(m.getUserId()).orElse(null))
                .filter(u -> u != null)
                .map(userService::mapToUserResponse)
                .collect(Collectors.toList());
    }

    public ServerResponse mapToServerResponse(Server server) {
        return ServerResponse.builder()
                .id(server.getId())
                .name(server.getName())
                .iconUrl(server.getIconUrl())
                .initials(server.getInitials())
                .hasNotification(false)
                .build();
    }
}
