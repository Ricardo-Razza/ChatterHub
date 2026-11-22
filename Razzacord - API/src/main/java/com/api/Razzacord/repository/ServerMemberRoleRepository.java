package com.api.Razzacord.repository;

import com.api.Razzacord.model.ServerMemberRole;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ServerMemberRoleRepository extends JpaRepository<ServerMemberRole, UUID> {
    List<ServerMemberRole> findByServerIdAndUserId(UUID serverId, UUID userId);
    List<ServerMemberRole> findByServerId(UUID serverId);
    void deleteByRoleId(UUID roleId);
    void deleteByServerIdAndUserId(UUID serverId, UUID userId);
    void deleteByServerId(UUID serverId);
}
