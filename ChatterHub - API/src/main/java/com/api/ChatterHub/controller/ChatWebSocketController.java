package com.api.ChatterHub.controller;

import com.api.ChatterHub.dto.*;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.security.AccessService;
import com.api.ChatterHub.service.DmService;
import com.api.ChatterHub.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Chat e DMs via STOMP. Todas as ações usam o usuário do JWT (Principal); o authorId do payload é ignorado.
 * A sinalização de voz mora em {@link VoiceWsController}.
 */
@Controller
public class ChatWebSocketController {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private MessageService messageService;

    @Autowired
    private DmService dmService;

    @Autowired
    private AccessService accessService;

    @MessageMapping("/chat.send")
    public void sendMessage(@Payload MessageRequest request, Principal principal) {
        User author = accessService.userByPrincipal(principal.getName());
        MessageResponse response = messageService.sendMessage(request, author);
        messagingTemplate.convertAndSend("/topic/channels/" + response.getChannelId(), response);
    }

    @MessageMapping("/dm.send")
    public void sendDm(@Payload DmRequest request, Principal principal) {
        User sender = accessService.userByPrincipal(principal.getName());
        DmResponse response = dmService.sendDmFromWs(sender, request.getReceiverId(), request.getContent());
        messagingTemplate.convertAndSend("/topic/dm/" + response.getReceiverId(), response);
        messagingTemplate.convertAndSend("/topic/dm/" + sender.getId(), response);
    }

    @MessageMapping("/message.edit")
    public void editMessage(@Payload WsMessageEditRequest request, Principal principal) {
        User editor = accessService.userByPrincipal(principal.getName());
        MessageResponse response = messageService.editMessage(request.getMessageId(), request.getContent(), editor);
        messagingTemplate.convertAndSend("/topic/channels/" + response.getChannelId() + "/events", response);
    }

    @MessageMapping("/message.delete")
    public void deleteMessage(@Payload WsMessageDeleteRequest request, Principal principal) {
        User requester = accessService.userByPrincipal(principal.getName());
        MessageResponse response = messageService.deleteMessage(request.getMessageId(), requester);
        messagingTemplate.convertAndSend("/topic/channels/" + response.getChannelId() + "/events", response);
    }
}
