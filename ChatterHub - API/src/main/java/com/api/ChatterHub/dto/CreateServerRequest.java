package com.api.ChatterHub.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateServerRequest {
    @NotBlank
    private String name;
    private String iconUrl;
}
