package com.api.Razzacord.controller;

import com.api.Razzacord.dto.EditMessageRequest;
import com.api.Razzacord.dto.MessageRequest;
import com.api.Razzacord.dto.MessageResponse;
import com.api.Razzacord.service.MessageService;
import com.api.Razzacord.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class MessageController {

    @Autowired
    private MessageService messageService;

    @Autowired
    private UserService userService;

    @GetMapping("/channels/{channelId}/messages")
    public ResponseEntity<List<MessageResponse>> getMessages(
            @PathVariable UUID channelId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(messageService.getMessages(channelId, page, size, userService.getCurrentUserModel()));
    }

    @PostMapping("/channels/{channelId}/messages")
    public ResponseEntity<MessageResponse> sendMessage(
            @PathVariable UUID channelId,
            @RequestBody MessageRequest request) {
        request.setChannelId(channelId);
        return ResponseEntity.ok(messageService.sendMessage(request, userService.getCurrentUserModel()));
    }

    @PutMapping("/messages/{id}")
    public ResponseEntity<MessageResponse> editMessage(
            @PathVariable UUID id,
            @RequestBody EditMessageRequest request) {
        return ResponseEntity.ok(messageService.editMessage(id, request.getContent(), userService.getCurrentUserModel()));
    }

    @DeleteMapping("/messages/{id}")
    public ResponseEntity<MessageResponse> deleteMessage(@PathVariable UUID id) {
        return ResponseEntity.ok(messageService.deleteMessage(id, userService.getCurrentUserModel()));
    }
}
