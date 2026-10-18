package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.DmRequest;
import com.api.ChatterHub.dto.DmResponse;
import com.api.ChatterHub.dto.UserResponse;
import com.api.ChatterHub.service.DmService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/dm")
public class DmController {

    @Autowired
    private DmService dmService;

    @GetMapping("/{userId}")
    public ResponseEntity<List<DmResponse>> getDmHistory(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(dmService.getHistory(userId, page, size));
    }

    @PostMapping("/{userId}")
    public ResponseEntity<DmResponse> sendDm(
            @PathVariable UUID userId,
            @RequestBody DmRequest request) {
        request.setReceiverId(userId);
        return ResponseEntity.ok(dmService.sendDm(request));
    }

    @GetMapping("/conversations")
    public ResponseEntity<List<UserResponse>> getConversations() {
        return ResponseEntity.ok(dmService.getConversations());
    }
}
