package com.api.Razzacord.controller;

import com.api.Razzacord.dto.ProfileRequest;
import com.api.Razzacord.dto.RoleRequest;
import com.api.Razzacord.dto.StatusRequest;
import com.api.Razzacord.dto.UserResponse;
import com.api.Razzacord.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @GetMapping
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser() {
        return ResponseEntity.ok(userService.getCurrentUser());
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<UserResponse> updateStatus(@PathVariable UUID id, @RequestBody StatusRequest request) {
        return ResponseEntity.ok(userService.updateStatus(id, request.getStatus()));
    }

    @PutMapping("/{id}/profile")
    public ResponseEntity<UserResponse> updateProfile(@PathVariable UUID id, @RequestBody ProfileRequest request) {
        return ResponseEntity.ok(userService.updateProfile(id, request));
    }

    @PatchMapping("/{id}/role")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserResponse> updateRole(@PathVariable UUID id, @RequestBody RoleRequest request) {
        return ResponseEntity.ok(userService.updateRole(id, request.getRole()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteUser(@PathVariable UUID id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }
}
