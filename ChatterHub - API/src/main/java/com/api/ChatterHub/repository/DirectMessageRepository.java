package com.api.ChatterHub.repository;

import com.api.ChatterHub.model.DirectMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface DirectMessageRepository extends JpaRepository<DirectMessage, UUID> {
    
    @Query("SELECT dm FROM DirectMessage dm WHERE (dm.senderId = :user1 AND dm.receiverId = :user2) OR (dm.senderId = :user2 AND dm.receiverId = :user1) ORDER BY dm.createdAt DESC")
    Page<DirectMessage> findConversation(@Param("user1") UUID user1, @Param("user2") UUID user2, Pageable pageable);
    
    @Query("SELECT DISTINCT dm.senderId FROM DirectMessage dm WHERE dm.receiverId = :userId " +
           "UNION " +
           "SELECT DISTINCT dm.receiverId FROM DirectMessage dm WHERE dm.senderId = :userId")
    List<UUID> findInteractedUsers(@Param("userId") UUID userId);
}
