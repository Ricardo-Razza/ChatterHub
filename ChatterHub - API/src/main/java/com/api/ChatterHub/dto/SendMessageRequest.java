package com.api.ChatterHub.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SendMessageRequest {
    @NotBlank
    private String channelId;

    @NotBlank
    private String authorId;

    @NotBlank
    private String content;
}
