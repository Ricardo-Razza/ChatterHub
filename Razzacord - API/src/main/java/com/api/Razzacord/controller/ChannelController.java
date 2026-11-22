package com.api.Razzacord.controller;

import com.api.Razzacord.dto.ChannelRequest;
import com.api.Razzacord.dto.ChannelResponse;
import com.api.Razzacord.model.User;
import com.api.Razzacord.security.AccessService;
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

    @GetMapping("/servers/{serverId}/channels")
    public ResponseEntity<List<ChannelResponse>> getChannels(@PathVariable UUID serverId) {
        accessService.requireServerMember(serverId, userService.getCurrentUserModel());
        return ResponseEntity.ok(channelService.getChannelsByServer(serverId));
    }

    @PostMapping("/channels")
    public ResponseEntity<ChannelResponse> createChannel(@RequestBody ChannelRequest request) {
        User user = userService.getCurrentUserModel();
        accessService.requireServerOwnerOrAdmin(request.getServerId(), user);
        return ResponseEntity.ok(channelService.createChannel(request));
    }

    @DeleteMapping("/channels/{id}")
    public ResponseEntity<Void> deleteChannel(@PathVariable UUID id) {
        User user = userService.getCurrentUserModel();
        UUID serverId = channelService.getServerId(id);
        accessService.requireServerOwnerOrAdmin(serverId, user);
        channelService.deleteChannel(id);
        return ResponseEntity.noContent().build();
    }
}
