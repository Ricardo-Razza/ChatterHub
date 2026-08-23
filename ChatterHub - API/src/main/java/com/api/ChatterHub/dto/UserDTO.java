package com.api.ChatterHub.dto;

import com.api.ChatterHub.model.PresenceStatus;
import com.api.ChatterHub.model.Role;
import lombok.*;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private String id;
    private String username;
    private String email;
    private String phone;
    private String ageGroup;
    private LocalDate birthDate;
    private String avatarUrl;
    private PresenceStatus status;
    private Role role;
    private boolean emailVerified;
    private String verificationCode; // Exibido para testes se não tiver servidor SMTP real
    private boolean isMuted;
    private boolean isDeafened;
    private boolean isSpeaking;
    private boolean isCameraOn;
    private boolean isSharingScreen;
}