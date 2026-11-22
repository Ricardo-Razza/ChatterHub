package com.api.Razzacord.repository;

import com.api.Razzacord.model.ServerMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServerMemberRepository extends JpaRepository<ServerMember, UUID> {
    List<ServerMember> findByUserId(UUID userId);
    List<ServerMember> findByServerId(UUID serverId);
    Optional<ServerMember> findByServerIdAndUserId(UUID serverId, UUID userId);
    long countByServerId(UUID serverId);
    void deleteByServerId(UUID serverId);
}
