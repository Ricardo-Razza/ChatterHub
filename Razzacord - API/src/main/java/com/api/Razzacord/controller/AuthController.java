package com.api.Razzacord.controller;

import com.api.Razzacord.dto.AuthRequest;
import com.api.Razzacord.dto.AuthResponse;
import com.api.Razzacord.service.LoginAttemptService;
import com.api.Razzacord.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class AuthController {

    @Autowired
    private UserService userService;

    @Autowired
    private LoginAttemptService loginAttempts;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody AuthRequest request) {
        return ResponseEntity.ok(userService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request, HttpServletRequest http) {
        String key = http.getRemoteAddr() + "|" + String.valueOf(request.getUsername()).toLowerCase();
        loginAttempts.checkAllowed(key);
        try {
            AuthResponse response = userService.login(request);
            loginAttempts.recordSuccess(key);
            return ResponseEntity.ok(response);
        } catch (AuthenticationException e) {
            loginAttempts.recordFailure(key);
            throw e;
        }
    }
}
