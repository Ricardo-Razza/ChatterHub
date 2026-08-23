package com.api.ChatterHub.dto;

import com.api.ChatterHub.model.ChannelType;
import lombok.*;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChannelDTO {
    private String id;
    private String serverId;
    private String name;
    private ChannelType type;
    private List<String> connectedUserIds;
    private boolean unread;
}
