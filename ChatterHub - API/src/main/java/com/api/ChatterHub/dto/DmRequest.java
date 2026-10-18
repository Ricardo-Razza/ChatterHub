package com.api.ChatterHub.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class DmRequest {
    private UUID receiverId;
    private String content;
}
