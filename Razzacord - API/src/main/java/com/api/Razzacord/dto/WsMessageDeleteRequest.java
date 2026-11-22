package com.api.Razzacord.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class WsMessageDeleteRequest {
    private UUID messageId;
}
