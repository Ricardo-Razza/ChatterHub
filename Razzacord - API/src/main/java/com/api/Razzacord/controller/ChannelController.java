package com.api.Razzacord.controller;

import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ChannelResponse;
import com.api.Razzacord.model.Permission;
import com.api.Razzacord.model.User;
import com.api.Razzacord.security.AccessService;
import com.api.Razzacord.security.PermissionService;
import com.api.Razzacord.service.ChannelService;
import com.api.Razzacord.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class ChannelController {

    @Autowired
    private ChannelService channelService;

    @Autowired
    private UserService userService;

    @Autowired
    private AccessService accessService;

    @Autowired
    private PermissionService permissionService;

    @GetMapping("/servers/{serverId}/channels")
    public ResponseEntity<List<ChannelResponse>> getChannels(@PathVariable UUID serverId) {
        accessService.requireServerMember(serverId, userService.getCurrentUserModel());
        return ResponseEntity.ok(channelService.getChannelsByServer(serverId));
    }

    @PostMapping("/channels")
    public ResponseEntity<ChannelResponse> createChannel(@RequestBody ChannelRequest request) {
        User user = userService.getCurrentUserModel();
        permissionService.require(request.getServerId(), user.getId(), Permission.MANAGE_CHANNELS);
        return ResponseEntity.ok(channelService.createChannel(request));
    }

    @PutMapping("/channels/{id}")
    public ResponseEntity<ChannelResponse> updateChannel(@PathVariable UUID id, @RequestBody ChannelRequest request) {
        UUID serverId = channelService.getServerId(id);
        permissionService.require(serverId, userService.getCurrentUserModel().getId(), Permission.MANAGE_CHANNELS);
        return ResponseEntity.ok(channelService.updateChannel(serverId, id, request));
    }

    @PutMapping("/servers/{serverId}/channels/order")
    public ResponseEntity<List<ChannelResponse>> reorderChannels(@PathVariable UUID serverId, @RequestBody List<UUID> ids) {
        permissionService.require(serverId, userService.getCurrentUserModel().getId(), Permission.MANAGE_CHANNELS);
        return ResponseEntity.ok(channelService.reorderChannels(serverId, ids));
    }

    @DeleteMapping("/channels/{id}")
    public ResponseEntity<Void> deleteChannel(@PathVariable UUID id) {
        User user = userService.getCurrentUserModel();
        UUID serverId = channelService.getServerId(id);
        permissionService.require(serverId, user.getId(), Permission.MANAGE_CHANNELS);
        channelService.deleteChannel(serverId, id);
        return ResponseEntity.noContent().build();
    }
}
