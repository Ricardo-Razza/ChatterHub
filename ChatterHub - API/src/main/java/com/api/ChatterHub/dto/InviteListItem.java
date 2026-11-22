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
public class InviteListItem {
    private String code;
    private LocalDateTime expiresAt;
    private int uses;
    private UUID createdBy;
}
