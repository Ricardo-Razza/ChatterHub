package com.api.Razzacord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelResponse {
    private UUID id;
    private UUID serverId;
    private String name;
    private String topic;
    private String category;
    private int position;
    private String type; // lowercase
    private List<UUID> connectedUserIds;
}
