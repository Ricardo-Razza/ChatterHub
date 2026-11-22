package com.api.Razzacord.service;

import com.api.Razzacord.dto.MemberResponse;
import com.api.Razzacord.dto.MyPermissionsResponse;
import com.api.Razzacord.dto.ServerRoleRequest;
import com.api.Razzacord.dto.ServerRoleResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerMemberRole;
import com.api.Razzacord.model.ServerRole;
import com.api.Razzacord.model.User;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerMemberRoleRepository;
import com.api.Razzacord.repository.ServerRepository;
import com.api.Razzacord.repository.ServerRoleRepository;
import com.api.Razzacord.security.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class RoleService {

    static final int MAX_ROLES = 50;
    private static final Pattern COLOR_RE = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final String DEFAULT_COLOR = "#99AAB5";

    private final ServerRepository serverRepository;
    private final ServerMemberRepository serverMemberRepository;
    private final ServerRoleRepository roleRepository;
    private final ServerMemberRoleRepository memberRoleRepository;
    private final PermissionService permissionService;
    private final UserService userService;
    private final ServerService serverService;
    private final ServerEventPublisher eventPublisher;

    public List<ServerRoleResponse> list(UUID serverId) {
        User me = userService.getCurrentUserModel();
        requireMember(serverId, me);
        return roleRepository.findByServerIdOrderByPositionDesc(serverId).stream().map(this::toResponse).toList();
    }

    @Transactional
    public ServerRoleResponse create(UUID serverId, ServerRoleRequest req) {
        User me = userService.getCurrentUserModel();
        permissionService.require(serverId, me.getId(), Permission.MANAGE_ROLES);

        String name = validName(req.getName());
        String color = req.getColor() == null ? DEFAULT_COLOR : validColor(req.getColor());
        long perms = req.getPermissions() == null ? 0 : validPermissions(req.getPermissions());
        requireGrantable(serverId, me, perms);
        if (roleRepository.countByServerId(serverId) >= MAX_ROLES) {
            throw ApiException.badRequest("Limite de " + MAX_ROLES + " cargos por servidor atingido");
        }

        List<ServerRole> roles = roleRepository.findByServerIdOrderByPositionDesc(serverId);
        int position;
        if (permissionService.isOwner(serverId, me.getId())) {
            position = roles.stream().mapToInt(ServerRole::getPosition).max().orElse(0) + 1;
        } else {
            // O novo cargo ocupa a posição do topo do ator; o topo dele e tudo acima sobem uma posição.
            position = permissionService.topPosition(serverId, me.getId());
            if (position < 1) throw ApiException.forbidden("Você não tem permissão para isso");
            for (ServerRole r : roles) {
                if (r.getPosition() >= position) r.setPosition(r.getPosition() + 1);
            }
            roleRepository.saveAll(roles);
        }

        ServerRole saved = roleRepository.save(ServerRole.builder()
                .serverId(serverId).name(name).color(color).permissions(perms).position(position).build());
        publishRoles(serverId);
        return toResponse(saved);
    }

    @Transactional
    public ServerRoleResponse update(UUID serverId, UUID roleId, ServerRoleRequest req) {
        User me = userService.getCurrentUserModel();
        permissionService.require(serverId, me.getId(), Permission.MANAGE_ROLES);
        ServerRole role = findRole(serverId, roleId);
        requireBelowMe(serverId, me, role);

        String name = req.getName() == null ? null : validName(req.getName());
        String color = req.getColor() == null ? null : validColor(req.getColor());
        Long perms = req.getPermissions() == null ? null : validPermissions(req.getPermissions());
        if (perms != null) requireGrantable(serverId, me, perms);

        if (name != null) role.setName(name);
        if (color != null) role.setColor(color);
        if (perms != null) role.setPermissions(perms);
        ServerRole saved = roleRepository.save(role);
        publishRoles(serverId);
        return toResponse(saved);
    }

    @Transactional
    public void delete(UUID serverId, UUID roleId) {
        User me = userService.getCurrentUserModel();
        permissionService.require(serverId, me.getId(), Permission.MANAGE_ROLES);
        ServerRole role = findRole(serverId, roleId);
        requireBelowMe(serverId, me, role);

        memberRoleRepository.deleteByRoleId(roleId);
        roleRepository.delete(role);
        List<ServerRole> above = roleRepository.findByServerIdOrderByPositionDesc(serverId).stream()
                .filter(r -> r.getPosition() > role.getPosition()).toList();
        above.forEach(r -> r.setPosition(r.getPosition() - 1));
        roleRepository.saveAll(above);
        publishRoles(serverId);
    }

    @Transactional
    public List<ServerRoleResponse> reorder(UUID serverId, List<UUID> roleIds) {
        User me = userService.getCurrentUserModel();
        permissionService.require(serverId, me.getId(), Permission.MANAGE_ROLES);
        if (roleIds == null) throw ApiException.badRequest("Lista de cargos inválida");

        List<ServerRole> roles = roleRepository.findByServerIdOrderByPositionDesc(serverId);
        Set<UUID> requested = new HashSet<>(roleIds);
        Set<UUID> existing = new HashSet<>();
        roles.forEach(r -> existing.add(r.getId()));
        if (requested.size() != roleIds.size() || !requested.equals(existing)) {
            throw ApiException.badRequest("A lista deve conter todos os cargos do servidor, sem repetição");
        }

        Map<UUID, Integer> newPosition = new HashMap<>();
        int n = roleIds.size();
        for (UUID id : roleIds) newPosition.put(id, n--);

        if (!permissionService.isOwner(serverId, me.getId())) {
            int top = permissionService.topPosition(serverId, me.getId());
            // Cargos do ator e acima: mesma ordem relativa e todos acima dos cargos abaixo do ator.
            List<UUID> protectedIds = roles.stream().filter(r -> r.getPosition() >= top).map(ServerRole::getId).toList();
            if (!roleIds.subList(0, protectedIds.size()).equals(protectedIds)) {
                throw ApiException.forbidden("Você não pode mover cargos iguais ou acima do seu");
            }
        }

        for (ServerRole r : roles) r.setPosition(newPosition.get(r.getId()));
        roleRepository.saveAll(roles);
        publishRoles(serverId);
        return roles.stream()
                .sorted((a, b) -> Integer.compare(b.getPosition(), a.getPosition()))
                .map(this::toResponse).toList();
    }

    @Transactional
    public MemberResponse assign(UUID serverId, UUID userId, List<UUID> roleIds) {
        User me = userService.getCurrentUserModel();
        permissionService.require(serverId, me.getId(), Permission.MANAGE_ROLES);
        if (roleIds == null) throw ApiException.badRequest("Lista de cargos inválida");
        if (serverMemberRepository.findByServerIdAndUserId(serverId, userId).isEmpty()) {
            throw ApiException.notFound("Membro não encontrado");
        }

        // PermissionService.rolesOf não filtra por servidor: rejeita ids de outros servidores aqui.
        Set<UUID> wanted = new LinkedHashSet<>(roleIds);
        Set<UUID> serverRoleIds = new HashSet<>();
        roleRepository.findByServerIdOrderByPositionDesc(serverId).forEach(r -> serverRoleIds.add(r.getId()));
        if (!serverRoleIds.containsAll(wanted)) throw ApiException.notFound("Cargo não encontrado");

        boolean owner = permissionService.isOwner(serverId, me.getId());
        int myTop = permissionService.topPosition(serverId, me.getId());
        if (!owner && (permissionService.isOwner(serverId, userId)
                || permissionService.topPosition(serverId, userId) >= myTop)) {
            throw ApiException.forbidden("Você não pode alterar os cargos deste membro");
        }

        List<ServerMemberRole> current = memberRoleRepository.findByServerIdAndUserId(serverId, userId);
        Set<UUID> currentIds = new HashSet<>();
        current.forEach(c -> currentIds.add(c.getRoleId()));

        Set<UUID> added = new LinkedHashSet<>(wanted);
        added.removeAll(currentIds);
        Set<UUID> removed = new HashSet<>(currentIds);
        removed.removeAll(wanted);

        if (!owner) {
            Set<UUID> touched = new HashSet<>(added);
            touched.addAll(removed);
            for (ServerRole r : roleRepository.findAllById(touched)) {
                if (r.getPosition() >= myTop) {
                    throw ApiException.forbidden("Você não pode atribuir ou remover cargos iguais ou acima do seu");
                }
            }
        }

        for (ServerMemberRole c : current) {
            if (removed.contains(c.getRoleId())) memberRoleRepository.delete(c);
        }
        for (UUID roleId : added) {
            memberRoleRepository.save(ServerMemberRole.builder()
                    .serverId(serverId).userId(userId).roleId(roleId).build());
        }

        eventPublisher.publish(serverId, Map.of("type", "member-roles", "userId", userId.toString()));
        return serverService.getMemberResponse(serverId, userId);
    }

    @Transactional
    public void setDefaultPermissions(UUID serverId, Long permissions) {
        User me = userService.getCurrentUserModel();
        Server server = serverRepository.lockById(serverId)
                .orElseThrow(() -> ApiException.notFound("Servidor não encontrado"));
        if (!server.getOwnerId().equals(me.getId())) {
            throw ApiException.forbidden("Apenas o dono pode alterar as permissões padrão");
        }
        if (permissions == null) throw ApiException.badRequest("Permissões inválidas");
        server.setDefaultPermissions(validPermissions(permissions));
        serverRepository.save(server);
        publishRoles(serverId);
    }

    public MyPermissionsResponse myPermissions(UUID serverId) {
        User me = userService.getCurrentUserModel();
        requireMember(serverId, me);
        long defaults = serverRepository.findById(serverId)
                .orElseThrow(() -> ApiException.notFound("Servidor não encontrado")).getDefaultPermissions();
        return MyPermissionsResponse.builder()
                .permissions(permissionService.effective(serverId, me.getId()))
                .owner(permissionService.isOwner(serverId, me.getId()))
                .topPosition(permissionService.topPosition(serverId, me.getId()))
                .defaultPermissions(defaults)
                .build();
    }

    // ---- helpers ----

    private void requireMember(UUID serverId, User me) {
        if (serverRepository.findById(serverId).isEmpty()) throw ApiException.notFound("Servidor não encontrado");
        if (!permissionService.isOwner(serverId, me.getId())
                && serverMemberRepository.findByServerIdAndUserId(serverId, me.getId()).isEmpty()) {
            throw ApiException.forbidden("Você não é membro deste servidor");
        }
    }

    private ServerRole findRole(UUID serverId, UUID roleId) {
        return roleRepository.findById(roleId)
                .filter(r -> r.getServerId().equals(serverId))
                .orElseThrow(() -> ApiException.notFound("Cargo não encontrado"));
    }

    private void requireBelowMe(UUID serverId, User me, ServerRole role) {
        if (permissionService.isOwner(serverId, me.getId())) return;
        if (role.getPosition() >= permissionService.topPosition(serverId, me.getId())) {
            throw ApiException.forbidden("Você não pode alterar cargos iguais ou acima do seu");
        }
    }

    private void requireGrantable(UUID serverId, User me, long perms) {
        if ((perms & ~permissionService.effective(serverId, me.getId())) != 0) {
            throw ApiException.forbidden("Você não pode conceder permissões que não possui");
        }
    }

    private String validName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() || name.length() > 32) {
            throw ApiException.badRequest("O nome do cargo deve ter entre 1 e 32 caracteres");
        }
        return name;
    }

    private String validColor(String color) {
        if (!COLOR_RE.matcher(color).matches()) {
            throw ApiException.badRequest("A cor deve estar no formato #RRGGBB");
        }
        return color;
    }

    private long validPermissions(long perms) {
        if (perms < 0 || perms > Permission.ALL) throw ApiException.badRequest("Permissões inválidas");
        return perms;
    }

    private void publishRoles(UUID serverId) {
        eventPublisher.publish(serverId, Map.of("type", "roles"));
    }

    private ServerRoleResponse toResponse(ServerRole r) {
        return ServerRoleResponse.builder().id(r.getId()).name(r.getName()).color(r.getColor())
                .permissions(r.getPermissions()).position(r.getPosition()).build();
    }
}
