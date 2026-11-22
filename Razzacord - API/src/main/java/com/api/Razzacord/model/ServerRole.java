package com.api.Razzacord.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "server_roles")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerRole {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID serverId;

    @Column(nullable = false)
    private String name;

    @Builder.Default
    @Column(nullable = false)
    private String color = "#99AAB5";

    private long permissions;

    private int position;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
