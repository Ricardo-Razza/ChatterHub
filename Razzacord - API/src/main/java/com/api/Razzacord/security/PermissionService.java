package com.api.Razzacord.security;

import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerMemberRole;
import com.api.Razzacord.model.ServerRole;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerMemberRoleRepository;
import com.api.Razzacord.repository.ServerRepository;
import com.api.Razzacord.repository.ServerRoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** Cálculo de permissões efetivas por servidor (dono, padrão do servidor e cargos). */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final ServerRepository serverRepository;
    private final ServerMemberRepository serverMemberRepository;
    private final ServerRoleRepository serverRoleRepository;
    private final ServerMemberRoleRepository serverMemberRoleRepository;

    public long effective(UUID serverId, UUID userId) {
        Server server = serverRepository.findById(serverId).orElse(null);
        if (server == null) return 0;
        if (server.getOwnerId().equals(userId)) return Permission.ALL;
        if (serverMemberRepository.findByServerIdAndUserId(serverId, userId).isEmpty()) return 0;
        long mask = server.getDefaultPermissions();
        for (ServerRole role : rolesOf(serverId, userId)) mask |= role.getPermissions();
        return mask;
    }

    public boolean has(UUID serverId, UUID userId, Permission p) {
        return Permission.has(effective(serverId, userId), p);
    }

    public void require(UUID serverId, UUID userId, Permission p) {
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> ApiException.notFound("Servidor não encontrado"));
        if (!server.getOwnerId().equals(userId)
                && serverMemberRepository.findByServerIdAndUserId(serverId, userId).isEmpty()) {
            throw ApiException.forbidden("Você não é membro deste servidor");
        }
        if (!Permission.has(effective(serverId, userId), p)) {
            throw ApiException.forbidden("Você não tem permissão para isso");
        }
    }

    public int topPosition(UUID serverId, UUID userId) {
        if (isOwner(serverId, userId)) return Integer.MAX_VALUE;
        return rolesOf(serverId, userId).stream().mapToInt(ServerRole::getPosition).max().orElse(0);
    }

    public boolean isOwner(UUID serverId, UUID userId) {
        return serverRepository.findById(serverId)
                .map(s -> s.getOwnerId().equals(userId))
                .orElse(false);
    }

    private List<ServerRole> rolesOf(UUID serverId, UUID userId) {
        List<UUID> roleIds = serverMemberRoleRepository.findByServerIdAndUserId(serverId, userId).stream()
                .map(ServerMemberRole::getRoleId).toList();
        return serverRoleRepository.findAllById(roleIds);
    }
}
