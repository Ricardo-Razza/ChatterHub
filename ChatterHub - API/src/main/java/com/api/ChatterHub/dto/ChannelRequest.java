package com.api.ChatterHub.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class ChannelRequest {
    private String name;
    private String type;
    private UUID serverId;
}
