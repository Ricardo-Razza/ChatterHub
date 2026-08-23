package com.api.ChatterHub.dto;

import com.api.ChatterHub.model.ChannelType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateChannelRequest {
    @NotBlank
    private String name;

    @NotNull
    private ChannelType type;

    @NotBlank
    private String serverId;
}
