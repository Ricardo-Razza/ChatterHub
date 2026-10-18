package com.api.ChatterHub.repository;

import com.api.ChatterHub.model.Channel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ChannelRepository extends JpaRepository<Channel, UUID> {
    List<Channel> findByServerId(UUID serverId);
    void deleteByServerId(UUID serverId);
}
