package com.api.Razzacord.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "server_member_roles", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "role_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerMemberRole {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID serverId;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private UUID roleId;
}
