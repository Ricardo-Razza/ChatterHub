package com.api.Razzacord.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class ChannelRequest {
    private String name;
    private String topic;
    private String category;
    private String type;
    private UUID serverId;
}
