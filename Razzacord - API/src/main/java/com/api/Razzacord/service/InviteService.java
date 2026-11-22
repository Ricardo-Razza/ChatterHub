package com.api.Razzacord.service;

import com.api.Razzacord.dto.InviteListItem;
import com.api.Razzacord.dto.InvitePreviewResponse;
import com.api.Razzacord.dto.InviteResponse;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerInvite;
import com.api.Razzacord.model.ServerMember;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.ServerInviteRepository;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
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
                .serverName(server.getName())
                .iconUrl(server.getIconUrl())
                .initials(server.getInitials())
                .memberCount((int) serverMemberRepository.countByServerId(server.getId()))
                .build();
    }

    public ServerResponse accept(String code) {
        ServerInvite invite = requireUsable(code);
        User user = userService.getCurrentUserModel();
        Server server = serverRepository.findById(invite.getServerId())
                .orElseThrow(() -> ApiException.notFound(INVALID));

        if (serverMemberRepository.findByServerIdAndUserId(server.getId(), user.getId()).isEmpty()) {
            try {
                serverMemberRepository.saveAndFlush(ServerMember.builder()
                        .serverId(server.getId())
                        .userId(user.getId())
                        .build());
            } catch (DataIntegrityViolationException e) {
                // aceite concorrente: já é membro
                return serverService.mapToServerResponse(server);
            }
            invite.setUses(invite.getUses() + 1);
            inviteRepository.save(invite);
        }
        return serverService.mapToServerResponse(server);
    }

    public List<InviteListItem> listInvites(UUID serverId) {
        requireOwner(serverId);
        return inviteRepository.findByServerIdAndRevokedFalseAndExpiresAtAfter(serverId, LocalDateTime.now()).stream()
                .map(i -> InviteListItem.builder()
                        .code(i.getCode())
                        .expiresAt(i.getExpiresAt())
                        .uses(i.getUses())
                        .createdBy(i.getCreatedBy())
                        .build())
                .toList();
    }

    public void revoke(String code) {
        ServerInvite invite = code == null ? null : inviteRepository.findByCode(code).orElse(null);
        if (invite == null) {
            throw ApiException.notFound(INVALID);
        }
        requireOwner(invite.getServerId());
        invite.setRevoked(true);
        inviteRepository.save(invite);
    }

    private void requireOwner(UUID serverId) {
        User user = userService.getCurrentUserModel();
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> ApiException.notFound("Servidor não encontrado"));
        if (!user.getId().equals(server.getOwnerId())) {
            throw ApiException.forbidden("Apenas o dono pode gerenciar convites");
        }
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
