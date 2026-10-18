package com.api.ChatterHub.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class MessageRequest {
    private UUID channelId;
    private UUID authorId;
    private String content;
}
