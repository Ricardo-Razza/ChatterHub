package com.api.Razzacord.dto;

import lombok.Data;

/** Campos nulos significam "não alterar" na edição. */
@Data
public class ServerRoleRequest {
    private String name;
    private String color;
    private Long permissions;
}
