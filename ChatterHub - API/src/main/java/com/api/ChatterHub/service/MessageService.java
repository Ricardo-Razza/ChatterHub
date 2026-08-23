package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.MessageDTO;
import com.api.ChatterHub.dto.SendMessageRequest;
import com.api.ChatterHub.model.Channel;
import com.api.ChatterHub.model.Message;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.ChannelRepository;
import com.api.ChatterHub.repository.MessageRepository;
import com.api.ChatterHub.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final ChannelRepository channelRepository;
    private final UserRepository userRepository;

    public List<MessageDTO> findByChannelId(String channelId) {
        List<Message> messages = messageRepository.findByChannelIdOrderByCreatedAtAsc(channelId);
        List<MessageDTO> dtoList = new ArrayList<>();

        String lastAuthorId = null;
        for (Message msg : messages) {
            boolean grouped = lastAuthorId != null && lastAuthorId.equals(msg.getAuthor().getId());
            MessageDTO dto = toDTO(msg, grouped);
            dtoList.add(dto);
            lastAuthorId = msg.getAuthor().getId();
        }

        return dtoList;
    }

    @Transactional
    public MessageDTO saveMessage(SendMessageRequest request) {
        Channel channel = channelRepository.findById(request.getChannelId())
                .orElseThrow(() -> new RuntimeException("Canal não encontrado: " + request.getChannelId()));

        User author = userRepository.findById(request.getAuthorId())
                .orElseThrow(() -> new RuntimeException("Autor não encontrado: " + request.getAuthorId()));

        Message message = Message.builder()
                .content(request.getContent())
                .createdAt(Instant.now())
                .author(author)
                .channel(channel)
                .build();

        Message saved = messageRepository.save(message);
        return toDTO(saved, false);
    }

    public MessageDTO toDTO(Message message, boolean grouped) {
        return MessageDTO.builder()
                .id(message.getId())
                .channelId(message.getChannel().getId())
                .authorId(message.getAuthor().getId())
                .authorName(message.getAuthor().getUsername())
                .authorAvatarUrl(message.getAuthor().getAvatarUrl())
                .content(message.getContent())
                .createdAt(message.getCreatedAt())
                .grouped(grouped)
                .build();
    }
}
