package com.api.ChatterHub.repository;

import com.api.ChatterHub.model.Server;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface ServerRepository extends JpaRepository<Server, UUID> {
}
