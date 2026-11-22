package com.api.Razzacord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageResponse {
    private UUID id;
    private UUID channelId;
    private UUID authorId;
    private String authorName;
    private String authorAvatarUrl;
    private String content;
    private LocalDateTime createdAt;
    private boolean edited;
    private LocalDateTime editedAt;
    @Builder.Default
    private boolean grouped = false;
}
