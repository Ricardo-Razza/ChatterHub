package com.api.ChatterHub.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerResponse {
    private UUID id;
    private String name;
    private String iconUrl;
    private String initials;
    @Builder.Default
    private boolean hasNotification = false;
}
