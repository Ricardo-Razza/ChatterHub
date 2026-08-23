package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.MessageDTO;
import com.api.ChatterHub.dto.SendMessageRequest;
import com.api.ChatterHub.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
public class ChatWsController {

    private final MessageService messageService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.send")
    public void receiveAndBroadcastMessage(@Payload SendMessageRequest request) {
        MessageDTO saved = messageService.saveMessage(request);
        messagingTemplate.convertAndSend("/topic/channels/" + request.getChannelId(), saved);
    }
}
