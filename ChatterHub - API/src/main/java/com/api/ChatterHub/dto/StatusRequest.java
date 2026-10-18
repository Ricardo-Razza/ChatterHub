package com.api.ChatterHub.dto;

import com.api.ChatterHub.model.Status;
import lombok.Data;

@Data
public class StatusRequest {
    private Status status;
}
