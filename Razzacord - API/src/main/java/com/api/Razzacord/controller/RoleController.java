package com.api.Razzacord.controller;

import com.api.Razzacord.dto.MemberResponse;
import com.api.Razzacord.dto.MyPermissionsResponse;
import com.api.Razzacord.dto.ServerRoleRequest;
import com.api.Razzacord.dto.ServerRoleResponse;
import com.api.Razzacord.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/servers/{serverId}")
@RequiredArgsConstructor
public class RoleController {

    record RoleIdsRequest(List<UUID> roleIds) {}
    record DefaultPermissionsRequest(Long permissions) {}

    private final RoleService roleService;

    @GetMapping("/roles")
    public ResponseEntity<List<ServerRoleResponse>> list(@PathVariable UUID serverId) {
        return ResponseEntity.ok(roleService.list(serverId));
    }

    @PostMapping("/roles")
    public ResponseEntity<ServerRoleResponse> create(@PathVariable UUID serverId, @RequestBody ServerRoleRequest req) {
        return ResponseEntity.ok(roleService.create(serverId, req));
    }

    @PutMapping("/roles/order")
    public ResponseEntity<List<ServerRoleResponse>> reorder(@PathVariable UUID serverId, @RequestBody RoleIdsRequest req) {
        return ResponseEntity.ok(roleService.reorder(serverId, req.roleIds()));
    }

    @PutMapping("/roles/{roleId}")
    public ResponseEntity<ServerRoleResponse> update(@PathVariable UUID serverId, @PathVariable UUID roleId,
                                                     @RequestBody ServerRoleRequest req) {
        return ResponseEntity.ok(roleService.update(serverId, roleId, req));
    }

    @DeleteMapping("/roles/{roleId}")
    public ResponseEntity<Void> delete(@PathVariable UUID serverId, @PathVariable UUID roleId) {
        roleService.delete(serverId, roleId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/members/{userId}/roles")
    public ResponseEntity<MemberResponse> assign(@PathVariable UUID serverId, @PathVariable UUID userId,
                                                 @RequestBody RoleIdsRequest req) {
        return ResponseEntity.ok(roleService.assign(serverId, userId, req.roleIds()));
    }

    @PutMapping("/default-permissions")
    public ResponseEntity<Void> setDefaultPermissions(@PathVariable UUID serverId,
                                                      @RequestBody DefaultPermissionsRequest req) {
        roleService.setDefaultPermissions(serverId, req.permissions());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/permissions")
    public ResponseEntity<MyPermissionsResponse> myPermissions(@PathVariable UUID serverId) {
        return ResponseEntity.ok(roleService.myPermissions(serverId));
    }
}
