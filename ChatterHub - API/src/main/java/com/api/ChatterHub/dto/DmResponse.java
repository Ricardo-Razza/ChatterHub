package com.api.ChatterHub.dto;

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
public class DmResponse {
    private UUID id;
    private UUID senderId;
    private UUID receiverId;
    private String content;
    private boolean readStatus;
    private LocalDateTime createdAt;
}
