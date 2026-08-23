package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.ChannelDTO;
import com.api.ChatterHub.dto.CreateChannelRequest;
import com.api.ChatterHub.service.ChannelService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ChannelController {

    private final ChannelService channelService;

    @GetMapping("/servers/{serverId}/channels")
    public ResponseEntity<List<ChannelDTO>> getChannelsByServer(@PathVariable String serverId) {
        return ResponseEntity.ok(channelService.findByServerId(serverId));
    }

    @GetMapping("/channels/{id}")
    public ResponseEntity<ChannelDTO> getChannelById(@PathVariable String id) {
        return ResponseEntity.ok(channelService.findById(id));
    }

    @PostMapping("/channels")
    public ResponseEntity<ChannelDTO> createChannel(@Valid @RequestBody CreateChannelRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(channelService.createChannel(request));
    }
}
