package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.AuthRequest;
import com.api.ChatterHub.dto.AuthResponse;
import com.api.ChatterHub.dto.ProfileRequest;
import com.api.ChatterHub.dto.UserResponse;
import com.api.ChatterHub.exception.ApiException;
import com.api.ChatterHub.model.Role;
import com.api.ChatterHub.model.Status;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class UserService implements UserDetailsService {

    private static final Pattern USERNAME_RE = Pattern.compile("^[A-Za-z0-9_.-]{3,32}$");
    private static final int MIN_PASSWORD = 8;
    private static final int MAX_PASSWORD = 72; // limite do BCrypt

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    @Lazy
    private PasswordEncoder passwordEncoder;

    @Autowired
    @Lazy
    private AuthenticationManager authenticationManager;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    /** O JWT carrega o id (não o username), então renomear a conta não invalida a sessão. */
    public UserDetails loadUserById(String id) throws UsernameNotFoundException {
        try {
            return userRepository.findById(UUID.fromString(id))
                    .orElseThrow(() -> new UsernameNotFoundException("User not found: " + id));
        } catch (IllegalArgumentException e) {
            throw new UsernameNotFoundException("Invalid user id");
        }
    }

    @Transactional
    public AuthResponse register(AuthRequest request) {
        String username = validUsername(request.getUsername());
        validatePassword(request.getPassword());

        if (userRepository.findByUsername(username).isPresent()) {
            throw ApiException.badRequest("Nome de usuário já está em uso");
        }

        // A primeira conta do sistema vira ADMIN; as demais são MEMBER.
        Role role = userRepository.count() == 0 ? Role.ADMIN : Role.MEMBER;

        User user = User.builder()
                .username(username)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .avatarUrl("https://api.dicebear.com/7.x/thumbs/svg?seed=" + username + "&backgroundColor=5865f2")
                .status(Status.ONLINE)
                .role(role)
                .build();

        user = userRepository.save(user);
        String token = jwtService.generateToken(user.getId().toString());

        return new AuthResponse(token, mapToUserResponse(user));
    }

    public AuthResponse login(AuthRequest request) {
        if (request.getUsername() == null || request.getPassword() == null) {
            throw new BadCredentialsException("Credenciais inválidas");
        }
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername().trim(), request.getPassword())
        );

        User user = userRepository.findByUsername(request.getUsername().trim())
                .orElseThrow(() -> new BadCredentialsException("Credenciais inválidas"));

        String token = jwtService.generateToken(user.getId().toString());
        return new AuthResponse(token, mapToUserResponse(user));
    }

    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    public UserResponse getCurrentUser() {
        return mapToUserResponse(getCurrentUserModel());
    }

    public User getCurrentUserModel() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw ApiException.forbidden("Não autenticado");
        }
        return userRepository.findByUsername(authentication.getName())
                .orElseThrow(() -> ApiException.forbidden("Usuário não encontrado"));
    }

    /** Só o próprio usuário (ou um ADMIN) pode alterar os dados da conta. */
    private User requireSelfOrAdmin(UUID id) {
        User current = getCurrentUserModel();
        if (!current.getId().equals(id) && current.getRole() != Role.ADMIN) {
            throw ApiException.forbidden("Você só pode alterar a sua própria conta");
        }
        return userRepository.findById(id).orElseThrow(() -> ApiException.notFound("Usuário não encontrado"));
    }

    @Transactional
    public UserResponse updateStatus(UUID id, Status status) {
        User user = requireSelfOrAdmin(id);
        user.setStatus(status);
        return mapToUserResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateProfile(UUID id, ProfileRequest request) {
        User user = requireSelfOrAdmin(id);
        User actor = getCurrentUserModel();

        if (request.getUsername() != null && !request.getUsername().isBlank()
                && !request.getUsername().equals(user.getUsername())) {
            String newName = validUsername(request.getUsername());
            if (userRepository.findByUsername(newName).isPresent()) {
                throw ApiException.badRequest("Nome de usuário já está em uso");
            }
            user.setUsername(newName);
        }

        if (request.getNewPassword() != null && !request.getNewPassword().isEmpty()) {
            validatePassword(request.getNewPassword());
            // Um admin redefinindo a senha de outra pessoa não precisa da senha atual dela.
            boolean self = actor.getId().equals(user.getId());
            if (self && (request.getCurrentPassword() == null
                    || !passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash()))) {
                throw ApiException.badRequest("Senha atual incorreta");
            }
            user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        }

        return mapToUserResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateRole(UUID id, Role role) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Usuário não encontrado"));
        if (user.getRole() == Role.ADMIN && role != Role.ADMIN
                && userRepository.findAll().stream().filter(u -> u.getRole() == Role.ADMIN).count() <= 1) {
            throw ApiException.badRequest("Não é possível remover o último administrador");
        }
        user.setRole(role);
        return mapToUserResponse(userRepository.save(user));
    }

    @Transactional
    public void deleteUser(UUID id) {
        userRepository.deleteById(id);
    }

    public UserResponse mapToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .status(user.getStatus())
                .role(user.getRole())
                .build();
    }

    private String validUsername(String raw) {
        String username = raw == null ? "" : raw.trim();
        if (!USERNAME_RE.matcher(username).matches()) {
            throw ApiException.badRequest("O usuário deve ter de 3 a 32 caracteres (letras, números, _ . -)");
        }
        return username;
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD) {
            throw ApiException.badRequest("A senha deve ter pelo menos " + MIN_PASSWORD + " caracteres");
        }
        if (password.length() > MAX_PASSWORD) {
            throw ApiException.badRequest("A senha deve ter no máximo " + MAX_PASSWORD + " caracteres");
        }
    }
}
