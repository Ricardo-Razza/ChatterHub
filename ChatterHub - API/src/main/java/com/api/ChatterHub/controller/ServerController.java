package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.CreateServerRequest;
import com.api.ChatterHub.dto.ServerDTO;
import com.api.ChatterHub.service.ServerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/servers")
@RequiredArgsConstructor
public class ServerController {

    private final ServerService serverService;

    @GetMapping
    public ResponseEntity<List<ServerDTO>> getAllServers() {
        return ResponseEntity.ok(serverService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ServerDTO> getServerById(@PathVariable String id) {
        return ResponseEntity.ok(serverService.findById(id));
    }

    @PostMapping
    public ResponseEntity<ServerDTO> createServer(@Valid @RequestBody CreateServerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(serverService.createServer(request));
    }
}
