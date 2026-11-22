package com.api.ChatterHub.repository;

import com.api.ChatterHub.model.ServerInvite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServerInviteRepository extends JpaRepository<ServerInvite, UUID> {
    Optional<ServerInvite> findByCode(String code);
    List<ServerInvite> findByServerIdAndRevokedFalseAndExpiresAtAfter(UUID serverId, LocalDateTime now);
    boolean existsByCode(String code);
    void deleteByServerId(UUID serverId);
}
