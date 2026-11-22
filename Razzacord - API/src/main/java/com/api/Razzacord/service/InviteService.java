package com.api.Razzacord.service;

import com.api.Razzacord.dto.InviteListItem;
import com.api.Razzacord.dto.InvitePreviewResponse;
import com.api.Razzacord.dto.InviteResponse;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerInvite;
import com.api.Razzacord.model.ServerMember;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.ServerInviteRepository;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerRepository;
import com.api.Razzacord.security.PermissionService;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
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
    @Autowired private PermissionService permissionService;
    @Autowired private MessageService messageService;
    @Autowired private ServerEventPublisher eventPublisher;

    @Transactional
    public InviteResponse createInvite(UUID serverId) {
        User user = userService.getCurrentUserModel();
        permissionService.require(serverId, user.getId(), Permission.CREATE_INVITE);
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
                .bannerUrl(server.getBannerUrl())
                .description(server.getDescription())
                .initials(server.getInitials())
                .memberCount((int) serverMemberRepository.countByServerId(server.getId()))
                .build();
    }

    @Transactional
    public ServerResponse accept(String code) {
        User user = userService.getCurrentUserModel();
        Server server = lockInviteServer(code);
        ServerInvite invite = requireUsable(code);
        if (serverMemberRepository.findByServerIdAndUserId(server.getId(), user.getId()).isEmpty()) {
            serverMemberRepository.save(ServerMember.builder()
                    .serverId(server.getId())
                    .userId(user.getId())
                    .build());
            invite.setUses(invite.getUses() + 1);
            if (server.getSystemChannelId() != null) {
                messageService.announceJoin(server.getSystemChannelId(), user);
            }
            eventPublisher.publish(server.getId(), Map.of("type", "member-joined"));
        }
        return serverService.mapToServerResponse(server);
    }

    private Server lockInviteServer(String code) {
        return serverRepository.lockByInviteCode(code).orElseThrow(() -> ApiException.notFound(INVALID));
    }

    public List<InviteListItem> listInvites(UUID serverId) {
        requireManageServer(serverId);
        return inviteRepository.findByServerIdAndRevokedFalseAndExpiresAtAfter(serverId, LocalDateTime.now()).stream()
                .map(i -> InviteListItem.builder()
                        .code(i.getCode())
                        .expiresAt(i.getExpiresAt())
                        .uses(i.getUses())
                        .createdBy(i.getCreatedBy())
                        .build())
                .toList();
    }

    @Transactional
    public void revoke(String code) {
        lockInviteServer(code);
        ServerInvite invite = code == null ? null : inviteRepository.findByCode(code).orElse(null);
        if (invite == null) {
            throw ApiException.notFound(INVALID);
        }
        requireManageServer(invite.getServerId());
        invite.setRevoked(true);
        inviteRepository.save(invite);
    }

    private void requireManageServer(UUID serverId) {
        permissionService.require(serverId, userService.getCurrentUserModel().getId(), Permission.MANAGE_SERVER);
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
