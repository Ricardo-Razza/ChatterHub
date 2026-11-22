package com.api.Razzacord.voice;

import lombok.Data;

import java.util.Map;
import java.util.UUID;

/** Payloads recebidos em /app/voice.* */
public final class VoiceMessages {

    private VoiceMessages() {}

    @Data
    public static class Join {
        private UUID channelId;
        private Map<String, Object> state;
    }

    @Data
    public static class Leave {
        private UUID channelId;
    }

    @Data
    public static class StateUpdate {
        private UUID channelId;
        private Map<String, Object> state;
    }

    @Data
    public static class Signal {
        private UUID channelId;
        private UUID targetId;
        private String type;
        private Object data;
    }
}
