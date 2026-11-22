package com.api.Razzacord.repository;

import com.api.Razzacord.model.Server;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ServerRepository extends JpaRepository<Server, UUID> {
}
