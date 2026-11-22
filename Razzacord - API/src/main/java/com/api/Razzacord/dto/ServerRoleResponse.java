package com.api.Razzacord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerRoleResponse {
    private UUID id;
    private String name;
    private String color;
    private long permissions;
    private int position;
}
