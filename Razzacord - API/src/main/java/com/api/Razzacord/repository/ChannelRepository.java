package com.api.Razzacord.repository;

import com.api.Razzacord.model.Channel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ChannelRepository extends JpaRepository<Channel, UUID> {
    List<Channel> findByServerId(UUID serverId);
    void deleteByServerId(UUID serverId);
}
