package com.api.Razzacord;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.dto.InvitePreviewResponse;
import com.api.Razzacord.dto.InviteResponse;
import com.api.Razzacord.dto.ServerRequest;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.exception.ApiException;
import com.api.Razzacord.model.ServerInvite;
import com.api.Razzacord.model.ServerMember;
import com.api.Razzacord.repository.ServerInviteRepository;
import com.api.Razzacord.repository.ServerMemberRepository;
import com.api.Razzacord.service.InviteService;
import com.api.Razzacord.service.ServerService;
import com.api.Razzacord.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class InviteServiceTest {

    @Autowired UserService userService;
    @Autowired ServerService serverService;
    @Autowired InviteService inviteService;
    @Autowired ServerInviteRepository inviteRepository;
    @Autowired ServerMemberRepository serverMemberRepository;

    String alice;
    String bob;
    ServerResponse server;

    @BeforeEach
    void setUp() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        AuthResponse a = userService.register(cred("alice_" + suffix));
        AuthResponse b = userService.register(cred("bob_" + suffix));
        alice = a.getUser().getUsername();
        bob = b.getUser().getUsername();
        authenticateAs(alice);
        server = serverService.createServer(serverReq("Srv " + suffix));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void assertStatus(HttpStatus expected, Runnable r) {
        ApiException ex = assertThrows(ApiException.class, r::run);
        assertEquals(expected, ex.getStatus());
    }

    @Test
    void createInvite_retornaCodigoDe8CaracteresEValidade7Dias() {
        InviteResponse inv = inviteService.createInvite(server.getId());
        assertTrue(inv.getCode().matches("[A-Za-z0-9]{8}"));
        LocalDateTime target = LocalDateTime.now().plusDays(7);
        assertTrue(inv.getExpiresAt().isAfter(target.minusMinutes(1)));
        assertTrue(inv.getExpiresAt().isBefore(target.plusMinutes(1)));
    }

    @Test
    void naoMembroNaoCriaConvite() {
        authenticateAs(bob);
        assertStatus(HttpStatus.FORBIDDEN, () -> inviteService.createInvite(server.getId()));
    }

    @Test
    void accept_adicionaMembroEIncrementaUsos() {
        String code = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(bob);
        ServerResponse joined = inviteService.accept(code);
        assertEquals(server.getId(), joined.getId());
        assertTrue(serverService.getServersForCurrentUser().stream().anyMatch(s -> s.getId().equals(server.getId())));
        assertEquals(1, inviteRepository.findByCode(code).orElseThrow().getUses());
    }

    @Test
    void accept_jaMembroEIdempotente() {
        String code = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(bob);
        inviteService.accept(code);
        assertDoesNotThrow(() -> inviteService.accept(code));
        assertEquals(1, inviteRepository.findByCode(code).orElseThrow().getUses());
    }

    @Test
    void conviteExpiradoDa404() {
        String code = inviteService.createInvite(server.getId()).getCode();
        ServerInvite inv = inviteRepository.findByCode(code).orElseThrow();
        inv.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        inviteRepository.save(inv);
        authenticateAs(bob);
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.accept(code));
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.preview(code));
    }

    @Test
    void conviteRevogadoDa404() {
        String code = inviteService.createInvite(server.getId()).getCode();
        ServerInvite inv = inviteRepository.findByCode(code).orElseThrow();
        inv.setRevoked(true);
        inviteRepository.save(inv);
        authenticateAs(bob);
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.accept(code));
    }

    @Test
    void apagarServidorApagaConvites() {
        String code = inviteService.createInvite(server.getId()).getCode();
        serverService.deleteServer(server.getId());
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.preview(code));
        assertTrue(inviteRepository.findByCode(code).isEmpty());
    }

    @Test
    void preview_mostraNomeEContagemDeMembros() {
        String code = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(bob);
        inviteService.accept(code);
        InvitePreviewResponse p = inviteService.preview(code);
        assertEquals(server.getName(), p.getServerName());
        assertEquals(2, p.getMemberCount());
    }

    @Test
    void membroDuplicadoERejeitadoPelaConstraint() {
        authenticateAs(bob);
        inviteService.accept(authCode());
        UUID bobId = userService.getCurrentUserModel().getId();
        assertThrows(DataIntegrityViolationException.class, () -> serverMemberRepository.saveAndFlush(
                ServerMember.builder().serverId(server.getId()).userId(bobId).build()));
    }

    private String authCode() {
        String current = SecurityContextHolder.getContext().getAuthentication().getName();
        authenticateAs(alice);
        String code = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(current);
        return code;
    }

    @Test
    void donoListaConvitesAtivos() {
        String code = inviteService.createInvite(server.getId()).getCode();
        assertTrue(inviteService.listInvites(server.getId()).stream().anyMatch(i -> i.getCode().equals(code)));
    }

    @Test
    void naoDonoNaoListaNemRevoga() {
        String code = inviteService.createInvite(server.getId()).getCode();
        authenticateAs(bob);
        inviteService.accept(code);
        assertStatus(HttpStatus.FORBIDDEN, () -> inviteService.listInvites(server.getId()));
        assertStatus(HttpStatus.FORBIDDEN, () -> inviteService.revoke(code));
    }

    @Test
    void donoRevogaConvite() {
        String code = inviteService.createInvite(server.getId()).getCode();
        inviteService.revoke(code);
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.preview(code));
        assertTrue(inviteService.listInvites(server.getId()).stream().noneMatch(i -> i.getCode().equals(code)));
        assertStatus(HttpStatus.NOT_FOUND, () -> inviteService.revoke("naoexiste"));
    }

    private AuthRequest cred(String username) {
        AuthRequest r = new AuthRequest();
        r.setUsername(username);
        r.setPassword("senhaSegura123");
        return r;
    }

    private ServerRequest serverReq(String name) {
        ServerRequest r = new ServerRequest();
        r.setName(name);
        return r;
    }

    private void authenticateAs(String username) {
        var details = userService.loadUserByUsername(username);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
    }
}
