package com.api.Razzacord.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MyPermissionsResponse {
    private long permissions;
    private boolean owner;
    private int topPosition;
}
