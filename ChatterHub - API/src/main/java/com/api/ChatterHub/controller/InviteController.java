package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.InvitePreviewResponse;
import com.api.ChatterHub.dto.ServerResponse;
import com.api.ChatterHub.service.InviteService;
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

    @PostMapping("/{code}/accept")
    public ResponseEntity<ServerResponse> accept(@PathVariable String code) {
        return ResponseEntity.ok(inviteService.accept(code));
    }
}
