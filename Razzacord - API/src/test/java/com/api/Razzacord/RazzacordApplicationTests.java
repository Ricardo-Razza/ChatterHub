package com.api.Razzacord;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class RazzacordApplicationTests {

    @Autowired
    private UserService userService;

    @Test
    void contextLoads() {
        assertNotNull(userService);
    }

    @Test
    void testRegisterAndLoginWithoutEmail() {
        AuthRequest registerRequest = new AuthRequest();
        registerRequest.setUsername("testuser_backend");
        registerRequest.setPassword("securePassword123");

        AuthResponse regResponse = userService.register(registerRequest);
        assertNotNull(regResponse);
        assertNotNull(regResponse.getToken());
        assertNotNull(regResponse.getUser());
        assertEquals("testuser_backend", regResponse.getUser().getUsername());

        // Agora realiza login com as mesmas credenciais
        AuthRequest loginRequest = new AuthRequest();
        loginRequest.setUsername("testuser_backend");
        loginRequest.setPassword("securePassword123");

        AuthResponse loginResponse = userService.login(loginRequest);
        assertNotNull(loginResponse);
        assertNotNull(loginResponse.getToken());
        assertEquals("testuser_backend", loginResponse.getUser().getUsername());
    }
}
