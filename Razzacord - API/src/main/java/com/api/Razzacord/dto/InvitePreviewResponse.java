package com.api.Razzacord.dto;

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
    private String bannerUrl;
    private String description;
    private String initials;
    private int memberCount;
}
