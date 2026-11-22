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
public class InvitePreviewResponse {
    private UUID serverId;
    private String serverName;
    private String iconUrl;
    private String initials;
    private int memberCount;
}
