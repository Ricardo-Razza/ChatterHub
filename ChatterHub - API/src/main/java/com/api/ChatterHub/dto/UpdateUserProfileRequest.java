package com.api.ChatterHub.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class UpdateUserProfileRequest {
    private String username;
    private String email;
    private String phone;
    private String ageGroup;
    private LocalDate birthDate;
    private String avatarUrl;
    private String currentPassword;
    private String newPassword;
}