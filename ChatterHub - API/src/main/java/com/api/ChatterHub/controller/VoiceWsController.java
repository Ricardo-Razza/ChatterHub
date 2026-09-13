package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.VoiceSignalDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Slf4j
@Controller
@RequiredArgsConstructor
public class VoiceWsController {

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/voice.signal")
    public void handleVoiceSignal(@Payload VoiceSignalDTO signal) {
        if (signal.getChannelId() == null || signal.getChannelId().isBlank()) {
            return;
        }

        log.info("[VoiceWsController] Sinal recebido: tipo={}, canal={}, remetente={}({}), destinatario={}",
                signal.getType(), signal.getChannelId(), signal.getSenderName(), signal.getSenderId(), signal.getTargetId());

        messagingTemplate.convertAndSend("/topic/voice/" + signal.getChannelId(), signal);
    }
}