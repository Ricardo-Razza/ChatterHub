package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.VoiceSignalDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
public class VoiceWsController {

    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/voice.signal")
    public void handleVoiceSignal(@Payload VoiceSignalDTO signal) {
        if (signal.getChannelId() == null || signal.getChannelId().isBlank()) {
            return;
        }

        // Se tem targetId específico, envia para fila de notificação específica ou faz broadcast no canal
        // No STOMP simples, fazemos broadcast no tópico do canal de voz e o front filtra por targetId/senderId
        messagingTemplate.convertAndSend("/topic/voice/" + signal.getChannelId(), signal);
    }
}