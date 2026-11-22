package com.api.Razzacord.dto;

import lombok.Data;

@Data
public class ProfileRequest {
    private String username;
    private String currentPassword;
    private String newPassword;
}
