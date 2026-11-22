package com.api.Razzacord.service;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.UUID;

/** Publica eventos do servidor em /topic/servers/{id}/events. */
@Component
@RequiredArgsConstructor
public class ServerEventPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    /** Envia só depois do commit, para quem refaz o fetch ao receber o evento não ler dado antigo. */
    public void publish(UUID serverId, Map<String, String> payload) {
        String destination = "/topic/servers/" + serverId + "/events";
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    messagingTemplate.convertAndSend(destination, payload);
                }
            });
        } else {
            messagingTemplate.convertAndSend(destination, payload);
        }
    }
}
