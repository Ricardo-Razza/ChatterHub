package com.api.ChatterHub.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InvitePreviewResponse {
    private String serverName;
    private String iconUrl;
    private String initials;
    private int memberCount;
}
