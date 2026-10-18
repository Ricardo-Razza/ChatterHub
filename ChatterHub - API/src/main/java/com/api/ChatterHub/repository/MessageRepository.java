package com.api.ChatterHub.repository;

import com.api.ChatterHub.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    Page<Message> findByChannelIdOrderByCreatedAtDesc(UUID channelId, Pageable pageable);
    void deleteByChannelId(UUID channelId);
}
