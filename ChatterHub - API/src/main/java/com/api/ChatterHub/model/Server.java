package com.api.ChatterHub.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "servers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Server {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    private String iconUrl;

    private String initials;

    @OneToMany(mappedBy = "server", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    @Builder.Default
    private List<Channel> channels = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null || this.id.isBlank()) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.initials == null && this.name != null && !this.name.isBlank()) {
            String[] parts = this.name.trim().split("\\s+");
            if (parts.length > 1) {
                this.initials = ("" + parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
            } else {
                this.initials = this.name.substring(0, Math.min(2, this.name.length())).toUpperCase();
            }
        }
    }
}
