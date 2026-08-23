package com.api.ChatterHub.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    private String id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    private String phone;

    private String ageGroup; // ex: "18+", "13-17"

    private LocalDate birthDate;

    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private PresenceStatus status = PresenceStatus.ONLINE;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Role role = Role.MEMBER;

    @Builder.Default
    private boolean emailVerified = false;

    private String verificationCode;

    @Builder.Default
    private boolean isMuted = false;

    @Builder.Default
    private boolean isDeafened = false;

    @PrePersist
    public void prePersist() {
        if (this.id == null || this.id.isBlank()) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.avatarUrl == null || this.avatarUrl.isBlank()) {
            this.avatarUrl = "https://api.dicebear.com/7.x/thumbs/svg?seed=" + this.username + "&backgroundColor=5865f2";
        }
        if (this.role == null) {
            this.role = Role.MEMBER;
        }
    }
}