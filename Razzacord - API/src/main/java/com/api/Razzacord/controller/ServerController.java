package com.api.Razzacord.controller;

import com.api.Razzacord.dto.InviteResponse;
import com.api.Razzacord.dto.ServerRequest;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.dto.MemberResponse;
import com.api.Razzacord.service.InviteService;
import com.api.Razzacord.service.ServerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/servers")
public class ServerController {

    @Autowired
    private ServerService serverService;

    @Autowired
    private InviteService inviteService;

    @GetMapping
    public ResponseEntity<List<ServerResponse>> getServers() {
        return ResponseEntity.ok(serverService.getServersForCurrentUser());
    }

    @PostMapping
    public ResponseEntity<ServerResponse> createServer(@RequestBody ServerRequest request) {
        return ResponseEntity.ok(serverService.createServer(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ServerResponse> updateServer(@PathVariable UUID id, @RequestBody ServerRequest request) {
        return ResponseEntity.ok(serverService.updateServer(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable UUID id) {
        serverService.deleteServer(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/invites")
    public ResponseEntity<InviteResponse> createInvite(@PathVariable UUID id) {
        return ResponseEntity.ok(inviteService.createInvite(id));
    }

    @GetMapping("/{id}/invites")
    public ResponseEntity<java.util.List<com.api.Razzacord.dto.InviteListItem>> listInvites(@PathVariable UUID id) {
        return ResponseEntity.ok(inviteService.listInvites(id));
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<Void> leaveServer(@PathVariable UUID id) {
        serverService.leaveServer(id);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{id}/members/{userId}")
    public ResponseEntity<Void> kickMember(@PathVariable UUID id, @PathVariable UUID userId) {
        serverService.kick(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    public ResponseEntity<List<MemberResponse>> getMembers(@PathVariable UUID id) {
        return ResponseEntity.ok(serverService.getServerMembers(id));
    }
}
