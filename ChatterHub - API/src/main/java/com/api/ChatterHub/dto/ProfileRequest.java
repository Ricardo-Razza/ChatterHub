package com.api.ChatterHub.dto;

import lombok.Data;

@Data
public class ProfileRequest {
    private String username;
    private String currentPassword;
    private String newPassword;
}
