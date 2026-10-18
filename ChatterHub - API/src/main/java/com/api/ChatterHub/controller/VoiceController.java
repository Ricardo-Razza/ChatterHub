package com.api.ChatterHub.controller;

import com.api.ChatterHub.model.User;
import com.api.ChatterHub.service.UserService;
import com.api.ChatterHub.repository.ChannelRepository;
import com.api.ChatterHub.security.AccessService;
import com.api.ChatterHub.voice.IceConfigService;
import com.api.ChatterHub.voice.LiveKitTokenService;
import com.api.ChatterHub.voice.VoiceRoomRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/voice")
@RequiredArgsConstructor
public class VoiceController {

    private final IceConfigService iceConfigService;
    private final UserService userService;
    private final ChannelRepository channelRepository;
    private final VoiceRoomRegistry registry;
    private final AccessService accessService;
    private final LiveKitTokenService liveKit;

    /** Servidores STUN/TURN com credencial temporária por usuário. */
    @GetMapping("/ice-servers")
    public ResponseEntity<Map<String, List<Map<String, Object>>>> iceServers() {
        User user = userService.getCurrentUserModel();
        return ResponseEntity.ok(Map.of("iceServers", iceConfigService.iceServersFor(user.getId().toString())));
    }

    /** Quem está em cada canal de voz do servidor (estado inicial da lista de canais). */
    @GetMapping("/servers/{serverId}/state")
    public ResponseEntity<List<Map<String, Object>>> serverVoiceState(@PathVariable UUID serverId) {
        accessService.requireServerMember(serverId, userService.getCurrentUserModel());
        List<Map<String, Object>> out = new ArrayList<>();
        channelRepository.findByServerId(serverId).forEach(channel -> {
            List<Map<String, Object>> users = registry.presence(channel.getId());
            if (!users.isEmpty()) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("channelId", channel.getId().toString());
                entry.put("users", users);
                out.add(entry);
            }
        });
        return ResponseEntity.ok(out);
    }

    /** Token do SFU (LiveKit) para o canal de voz. 404 quando o SFU não está configurado: o cliente usa P2P. */
    @GetMapping("/sfu")
    public ResponseEntity<Map<String, String>> sfu(@RequestParam UUID channelId) {
        User user = userService.getCurrentUserModel();
        accessService.requireVoiceChannelMember(channelId, user);
        return liveKit.tokenFor(channelId.toString(), user.getId().toString(), user.getUsername())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
