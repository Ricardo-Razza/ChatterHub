package com.api.Razzacord.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class ServerRequest {
    private String name;
    private String iconUrl;
    private String bannerUrl;
    private String description;
    private String accentColor;
    private UUID systemChannelId;
}
