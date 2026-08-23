package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.MessageDTO;
import com.api.ChatterHub.dto.SendMessageRequest;
import com.api.ChatterHub.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping("/{channelId}/messages")
    public ResponseEntity<List<MessageDTO>> getMessagesByChannel(@PathVariable String channelId) {
        return ResponseEntity.ok(messageService.findByChannelId(channelId));
    }

    @PostMapping("/{channelId}/messages")
    public ResponseEntity<MessageDTO> postMessage(
            @PathVariable String channelId,
            @Valid @RequestBody SendMessageRequest request) {
        request.setChannelId(channelId);
        MessageDTO savedMessage = messageService.saveMessage(request);

        // Notificar clientes conectados via WebSocket no canal
        messagingTemplate.convertAndSend("/topic/channels/" + channelId, savedMessage);

        return ResponseEntity.status(HttpStatus.CREATED).body(savedMessage);
    }
}
