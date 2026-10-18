package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.MessageRequest;
import com.api.ChatterHub.dto.MessageResponse;
import com.api.ChatterHub.exception.ApiException;
import com.api.ChatterHub.model.Channel;
import com.api.ChatterHub.model.Message;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.MessageRepository;
import com.api.ChatterHub.repository.UserRepository;
import com.api.ChatterHub.security.AccessService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MessageService {

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccessService accessService;

    public List<MessageResponse> getMessages(UUID channelId, int page, int size, User viewer) {
        accessService.requireChannelMember(channelId, viewer);
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by("createdAt").descending());
        Page<Message> messagePage = messageRepository.findByChannelIdOrderByCreatedAtDesc(channelId, pageable);

        List<MessageResponse> responses = messagePage.getContent().stream()
                .map(this::mapToMessageResponse)
                .collect(Collectors.toList());

        Collections.reverse(responses);
        return responses;
    }

    public MessageResponse sendMessage(MessageRequest request, User author) {
        if (request.getChannelId() == null) {
            throw ApiException.badRequest("channelId obrigatório");
        }
        String content = validContent(request.getContent());
        accessService.requireChannelMember(request.getChannelId(), author);

        // O autor é sempre quem está autenticado; authorId vindo do cliente é ignorado.
        Message message = Message.builder()
                .channelId(request.getChannelId())
                .authorId(author.getId())
                .content(content)
                .build();
        return mapToMessageResponse(messageRepository.save(message));
    }

    public MessageResponse editMessage(UUID id, String content, User editor) {
        Message message = messageRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Mensagem não encontrada"));

        if (!message.getAuthorId().equals(editor.getId())) {
            throw ApiException.forbidden("Apenas o autor pode editar");
        }
        if (message.isDeleted()) {
            throw ApiException.badRequest("Mensagem já foi apagada");
        }

        message.setContent(validContent(content));
        message.setEdited(true);
        message.setEditedAt(LocalDateTime.now());

        return mapToMessageResponse(messageRepository.save(message));
    }

    public MessageResponse deleteMessage(UUID id, User requester) {
        Message message = messageRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Mensagem não encontrada"));

        Channel channel = accessService.requireChannelMember(message.getChannelId(), requester);
        boolean author = message.getAuthorId().equals(requester.getId());
        if (!author && !accessService.canModerate(channel.getServerId(), requester)) {
            throw ApiException.forbidden("Sem permissão para apagar esta mensagem");
        }

        // Soft delete
        message.setContent("[Mensagem deletada]");
        message.setDeleted(true);

        return mapToMessageResponse(messageRepository.save(message));
    }

    public void deleteMessagesByChannelId(UUID channelId) {
        messageRepository.deleteByChannelId(channelId);
    }

    public MessageResponse mapToMessageResponse(Message message) {
        User author = userRepository.findById(message.getAuthorId()).orElse(null);

        return MessageResponse.builder()
                .id(message.getId())
                .channelId(message.getChannelId())
                .authorId(message.getAuthorId())
                .authorName(author != null ? author.getUsername() : "Unknown")
                .authorAvatarUrl(author != null ? author.getAvatarUrl() : "")
                .content(message.getContent())
                .createdAt(message.getCreatedAt())
                .edited(message.isEdited())
                .editedAt(message.getEditedAt())
                .grouped(false)
                .build();
    }

    private String validContent(String content) {
        if (content == null || content.isBlank()) {
            throw ApiException.badRequest("A mensagem não pode ser vazia");
        }
        if (content.length() > 4000) {
            throw ApiException.badRequest("A mensagem excede 4000 caracteres");
        }
        return content;
    }
}
