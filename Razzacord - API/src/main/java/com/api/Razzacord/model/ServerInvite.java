package com.api.Razzacord.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "server_invites")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 8)
    private String code;

    @Column(nullable = false)
    private UUID serverId;

    @Column(nullable = false)
    private UUID createdBy;

    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    /** null = usos ilimitados. */
    private Integer maxUses;

    private int uses;

    private boolean revoked;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
