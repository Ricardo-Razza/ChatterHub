package com.api.ChatterHub.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class WsMessageEditRequest {
    private UUID messageId;
    private String content;
}
