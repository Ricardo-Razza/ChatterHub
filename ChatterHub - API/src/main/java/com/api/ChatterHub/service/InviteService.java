package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.InvitePreviewResponse;
import com.api.ChatterHub.dto.InviteResponse;
import com.api.ChatterHub.dto.ServerResponse;
import com.api.ChatterHub.exception.ApiException;
import com.api.ChatterHub.model.Server;
import com.api.ChatterHub.model.ServerInvite;
import com.api.ChatterHub.model.ServerMember;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.ServerInviteRepository;
import com.api.ChatterHub.repository.ServerMemberRepository;
import com.api.ChatterHub.repository.ServerRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class InviteService {

    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final int CODE_LENGTH = 8;
    private static final int VALID_DAYS = 7;
    private static final String INVALID = "Convite inválido ou expirado";

    private final SecureRandom random = new SecureRandom();

    @Autowired private ServerInviteRepository inviteRepository;
    @Autowired private ServerRepository serverRepository;
    @Autowired private ServerMemberRepository serverMemberRepository;
    @Autowired private UserService userService;
    @Autowired private ServerService serverService;

    @Transactional
    public InviteResponse createInvite(UUID serverId) {
        User user = userService.getCurrentUserModel();
        if (serverMemberRepository.findByServerIdAndUserId(serverId, user.getId()).isEmpty()) {
            throw ApiException.forbidden("Você não é membro deste servidor");
        }
        ServerInvite invite = ServerInvite.builder()
                .code(generateCode())
                .serverId(serverId)
                .createdBy(user.getId())
                .expiresAt(LocalDateTime.now().plusDays(VALID_DAYS))
                .build();
        invite = inviteRepository.save(invite);
        return InviteResponse.builder().code(invite.getCode()).expiresAt(invite.getExpiresAt()).build();
    }

    public InvitePreviewResponse preview(String code) {
        ServerInvite invite = requireUsable(code);
        Server server = serverRepository.findById(invite.getServerId())
                .orElseThrow(() -> ApiException.notFound(INVALID));
        return InvitePreviewResponse.builder()
                .serverId(server.getId())
                .serverName(server.getName())
                .iconUrl(server.getIconUrl())
                .initials(server.getInitials())
                .memberCount(serverMemberRepository.findByServerId(server.getId()).size())
                .build();
    }

    @Transactional
    public ServerResponse accept(String code) {
        ServerInvite invite = requireUsable(code);
        User user = userService.getCurrentUserModel();
        Server server = serverRepository.findById(invite.getServerId())
                .orElseThrow(() -> ApiException.notFound(INVALID));

        if (serverMemberRepository.findByServerIdAndUserId(server.getId(), user.getId()).isEmpty()) {
            serverMemberRepository.save(ServerMember.builder()
                    .serverId(server.getId())
                    .userId(user.getId())
                    .build());
            invite.setUses(invite.getUses() + 1);
            inviteRepository.save(invite);
        }
        return serverService.mapToServerResponse(server);
    }

    private ServerInvite requireUsable(String code) {
        ServerInvite invite = code == null ? null : inviteRepository.findByCode(code).orElse(null);
        if (invite == null
                || invite.isRevoked()
                || invite.getExpiresAt().isBefore(LocalDateTime.now())
                || (invite.getMaxUses() != null && invite.getUses() >= invite.getMaxUses())
                || !serverRepository.existsById(invite.getServerId())) {
            throw ApiException.notFound(INVALID);
        }
        return invite;
    }

    private String generateCode() {
        String code;
        do {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            }
            code = sb.toString();
        } while (inviteRepository.existsByCode(code));
        return code;
    }
}
