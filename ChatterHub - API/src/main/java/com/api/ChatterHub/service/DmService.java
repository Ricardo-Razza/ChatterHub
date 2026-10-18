package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.DmRequest;
import com.api.ChatterHub.dto.DmResponse;
import com.api.ChatterHub.dto.UserResponse;
import com.api.ChatterHub.exception.ApiException;
import com.api.ChatterHub.model.DirectMessage;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.DirectMessageRepository;
import com.api.ChatterHub.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DmService {

    @Autowired
    private DirectMessageRepository dmRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    public List<DmResponse> getHistory(UUID otherUserId, int page, int size) {
        User currentUser = userService.getCurrentUserModel();
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        Page<DirectMessage> dmPage = dmRepository.findConversation(currentUser.getId(), otherUserId, pageable);

        List<DmResponse> responses = dmPage.getContent().stream()
                .map(this::mapToDmResponse)
                .collect(Collectors.toList());

        Collections.reverse(responses);
        return responses;
    }

    public DmResponse sendDm(DmRequest request) {
        return sendDmFromWs(userService.getCurrentUserModel(), request.getReceiverId(), request.getContent());
    }

    public DmResponse sendDmFromWs(User sender, UUID receiverId, String content) {
        if (receiverId == null || !userRepository.existsById(receiverId)) {
            throw ApiException.notFound("Destinatário não encontrado");
        }
        if (content == null || content.isBlank()) {
            throw ApiException.badRequest("A mensagem não pode ser vazia");
        }
        if (content.length() > 4000) {
            throw ApiException.badRequest("A mensagem excede 4000 caracteres");
        }
        DirectMessage dm = DirectMessage.builder()
                .senderId(sender.getId())
                .receiverId(receiverId)
                .content(content)
                .build();
        return mapToDmResponse(dmRepository.save(dm));
    }

    public List<UserResponse> getConversations() {
        User currentUser = userService.getCurrentUserModel();
        List<UUID> interactedUserIds = dmRepository.findInteractedUsers(currentUser.getId());

        interactedUserIds.remove(currentUser.getId());

        return interactedUserIds.stream()
                .map(id -> userRepository.findById(id).orElse(null))
                .filter(u -> u != null)
                .map(userService::mapToUserResponse)
                .collect(Collectors.toList());
    }

    private DmResponse mapToDmResponse(DirectMessage dm) {
        return DmResponse.builder()
                .id(dm.getId())
                .senderId(dm.getSenderId())
                .receiverId(dm.getReceiverId())
                .content(dm.getContent())
                .readStatus(dm.isReadStatus())
                .createdAt(dm.getCreatedAt())
                .build();
    }
}
