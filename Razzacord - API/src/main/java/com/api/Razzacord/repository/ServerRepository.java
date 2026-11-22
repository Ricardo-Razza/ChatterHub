package com.api.Razzacord.repository;

import com.api.Razzacord.model.Server;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ServerRepository extends JpaRepository<Server, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Server s where s.id = :id")
    Optional<Server> lockById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Server s where exists (select i.id from ServerInvite i where i.serverId = s.id and i.code = :code)")
    Optional<Server> lockByInviteCode(@Param("code") String code);
}
