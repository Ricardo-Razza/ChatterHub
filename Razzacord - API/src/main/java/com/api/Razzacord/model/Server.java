package com.api.Razzacord.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "servers")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Server {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String iconUrl;

    private String initials;

    @Column(nullable = false)
    private UUID ownerId;

    @Builder.Default
    @Column(nullable = false, columnDefinition = "BIGINT DEFAULT 65 NOT NULL")
    private long defaultPermissions = 65;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
