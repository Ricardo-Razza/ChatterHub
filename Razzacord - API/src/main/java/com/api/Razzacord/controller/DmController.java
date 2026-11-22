package com.api.Razzacord.controller;

import com.api.Razzacord.dto.DmRequest;
import com.api.Razzacord.dto.DmResponse;
import com.api.Razzacord.dto.UserResponse;
import com.api.Razzacord.service.DmService;
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
