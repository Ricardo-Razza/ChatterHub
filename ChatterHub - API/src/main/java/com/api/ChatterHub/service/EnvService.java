package com.api.ChatterHub.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class EnvService {

    /**
     * Carrega as variáveis do arquivo .env para as System Properties do Java
     * antes da inicialização do contexto do Spring Boot.
     */
    public static void load() {
        Path[] possiblePaths = {
            Paths.get(".env"),
            Paths.get("../.env"),
            Paths.get("ChatterHub - API/.env")
        };

        for (Path path : possiblePaths) {
            if (Files.exists(path)) {
                try {
                    Files.lines(path)
                        .map(String::trim)
                        .filter(line -> !line.isEmpty() && !line.startsWith("#") && line.contains("="))
                        .forEach(line -> {
                            int idx = line.indexOf('=');
                            String key = line.substring(0, idx).trim();
                            String value = line.substring(idx + 1).trim();
                            if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                                value = value.substring(1, value.length() - 1);
                            }
                            if (System.getProperty(key) == null) {
                                System.setProperty(key, value);
                            }
                        });
                    break;
                } catch (IOException ignored) {
                }
            }
        }
    }

    public String get(String key) {
        String val = System.getProperty(key);
        return val != null ? val : System.getenv(key);
    }

    public String get(String key, String defaultValue) {
        String val = get(key);
        return val != null ? val : defaultValue;
    }
}
