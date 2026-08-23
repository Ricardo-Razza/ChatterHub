package com.api.ChatterHub.dto;

import lombok.*;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageDTO {
    private String id;
    private String channelId;
    private String authorId;
    private String authorName;
    private String authorAvatarUrl;
    private String content;
    private Instant createdAt;
    private boolean grouped;
}
