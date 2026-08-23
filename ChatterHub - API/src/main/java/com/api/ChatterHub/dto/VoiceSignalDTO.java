package com.api.ChatterHub.dto;

import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VoiceSignalDTO {
    private String channelId;
    private String senderId;
    private String senderName;
    private String targetId;
    private String type; // "join", "leave", "offer", "answer", "ice-candidate", "state-change"
    private Object data; // SDP payload or ICE candidate object or mute/video state
}