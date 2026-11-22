package com.api.Razzacord.dto;

import com.api.Razzacord.model.Status;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberResponse {
    private UUID id;
    private String username;
    private String avatarUrl;
    private Status status;
    private boolean owner;
    private List<UUID> roleIds;
}
