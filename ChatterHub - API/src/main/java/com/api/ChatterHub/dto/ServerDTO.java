package com.api.ChatterHub.dto;

import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ServerDTO {
    private String id;
    private String name;
    private String iconUrl;
    private String initials;
    private boolean hasNotification;
}
