package com.api.Razzacord.controller;

import com.api.Razzacord.dto.InvitePreviewResponse;
import com.api.Razzacord.dto.ServerResponse;
import com.api.Razzacord.service.InviteService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/invites")
public class InviteController {

    @Autowired
    private InviteService inviteService;

    @GetMapping("/{code}")
    public ResponseEntity<InvitePreviewResponse> preview(@PathVariable String code) {
        return ResponseEntity.ok(inviteService.preview(code));
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Void> revoke(@PathVariable String code) {
        inviteService.revoke(code);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{code}/accept")
    public ResponseEntity<ServerResponse> accept(@PathVariable String code) {
        return ResponseEntity.ok(inviteService.accept(code));
    }
}
