package com.api.ChatterHub.dto;

import com.api.ChatterHub.model.Role;
import com.api.ChatterHub.model.Status;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {
    private UUID id;
    private String username;
    private String avatarUrl;
    private Status status;
    private Role role;
}
