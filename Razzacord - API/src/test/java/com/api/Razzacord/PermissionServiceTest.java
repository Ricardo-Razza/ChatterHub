package com.api.Razzacord;

import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.Server;
import com.api.Razzacord.model.ServerMember;
import com.api.Razzacord.model.ServerMemberRole;
import com.api.Razzacord.model.ServerRole;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.repository.ServerMemberRoleRepository;
import com.api.Razzacord.repository.ServerRepository;
import com.api.Razzacord.repository.ServerRoleRepository;
import com.api.Razzacord.security.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class PermissionServiceTest {

    @Autowired PermissionService permissions;
    @Autowired ServerRepository serverRepository;
    @Autowired ServerMemberRepository memberRepository;
    @Autowired ServerRoleRepository roleRepository;
    @Autowired ServerMemberRoleRepository memberRoleRepository;

    UUID owner;
    UUID member;
    Server server;

    @BeforeEach
    void setUp() {
        owner = UUID.randomUUID();
        member = UUID.randomUUID();
        server = serverRepository.saveAndFlush(Server.builder().name("Srv").ownerId(owner).build());
        memberRepository.save(ServerMember.builder().serverId(server.getId()).userId(owner).build());
        memberRepository.save(ServerMember.builder().serverId(server.getId()).userId(member).build());
    }

    private ServerRole role(String name, long perms, int position) {
        return roleRepository.save(ServerRole.builder()
                .serverId(server.getId()).name(name).permissions(perms).position(position).build());
    }

    private void assign(ServerRole r) {
        memberRoleRepository.save(ServerMemberRole.builder()
                .serverId(server.getId()).userId(member).roleId(r.getId()).build());
    }

    @Test
    void ownerHasAll() {
        assertEquals(255L, permissions.effective(server.getId(), owner));
        assertTrue(permissions.isOwner(server.getId(), owner));
    }

    @Test
    void memberWithoutRolesGetsDefault() {
        assertEquals(65L, permissions.effective(server.getId(), member));
        assertTrue(permissions.has(server.getId(), member, Permission.STREAM));
        assertFalse(permissions.has(server.getId(), member, Permission.MANAGE_CHANNELS));
    }

    @Test
    void rolesAreOred() {
        assign(role("A", Permission.MANAGE_CHANNELS.bit(), 1));
        assign(role("B", Permission.KICK_MEMBERS.bit(), 2));
        assertEquals(65L | 2 | 16, permissions.effective(server.getId(), member));
    }

    @Test
    void nonMemberGetsZero() {
        UUID stranger = UUID.randomUUID();
        assertEquals(0L, permissions.effective(server.getId(), stranger));
        ApiException ex = assertThrows(ApiException.class,
                () -> permissions.require(server.getId(), stranger, Permission.STREAM));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
        assertEquals("Você não é membro deste servidor", ex.getMessage());
    }

    @Test
    void requireMissingPermissionThrows403() {
        ApiException ex = assertThrows(ApiException.class,
                () -> permissions.require(server.getId(), member, Permission.MANAGE_ROLES));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
        assertEquals("Você não tem permissão para isso", ex.getMessage());
        assertDoesNotThrow(() -> permissions.require(server.getId(), member, Permission.STREAM));
    }

    @Test
    void requireUnknownServerThrows404() {
        ApiException ex = assertThrows(ApiException.class,
                () -> permissions.require(UUID.randomUUID(), member, Permission.STREAM));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void topPosition() {
        assertEquals(0, permissions.topPosition(server.getId(), member));
        assign(role("A", 0, 2));
        assign(role("B", 0, 5));
        assertEquals(5, permissions.topPosition(server.getId(), member));
        assertEquals(Integer.MAX_VALUE, permissions.topPosition(server.getId(), owner));
    }

    @Test
    void defaultPermissionsChangeApplies() {
        server.setDefaultPermissions(0);
        serverRepository.saveAndFlush(server);
        assertEquals(0L, permissions.effective(server.getId(), member));
    }

    @Test
    void permissionHelpers() {
        assertEquals(255L, Permission.ALL);
        assertEquals(65L, Permission.of(Permission.CREATE_INVITE, Permission.STREAM));
        assertTrue(Permission.has(65L, Permission.STREAM));
        assertFalse(Permission.has(65L, Permission.KICK_MEMBERS));
    }
}
