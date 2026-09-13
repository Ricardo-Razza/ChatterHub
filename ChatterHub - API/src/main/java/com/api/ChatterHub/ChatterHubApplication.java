package com.api.ChatterHub;

import com.api.ChatterHub.service.EnvService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ChatterHubApplication {

	public static void main(String[] args) {
		EnvService.load();
		SpringApplication.run(ChatterHubApplication.class, args);
	}

}
