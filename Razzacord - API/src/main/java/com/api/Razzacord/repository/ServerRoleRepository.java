package com.api.Razzacord.repository;

import com.api.Razzacord.model.ServerRole;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ServerRoleRepository extends JpaRepository<ServerRole, UUID> {
    List<ServerRole> findByServerIdOrderByPositionDesc(UUID serverId);
    long countByServerId(UUID serverId);
    void deleteByServerId(UUID serverId);
}
