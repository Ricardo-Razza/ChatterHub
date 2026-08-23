package com.api.ChatterHub.service;

import com.api.ChatterHub.dto.*;
import com.api.ChatterHub.model.PresenceStatus;
import com.api.ChatterHub.model.Role;
import com.api.ChatterHub.model.User;
import com.api.ChatterHub.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.Random;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    public List<UserDTO> findAll() {
        return userRepository.findAll().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public UserDTO findById(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado: " + id));
        return toDTO(user);
    }

    @Transactional
    public UserDTO registerUser(CreateUserRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("Nome de usuário já está em uso.");
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email já está em uso.");
        }

        // Verifica se já existe algum usuário verificado ou registrado no sistema.
        // Apenas a PRIMEIRÍSSIMA conta criada no sistema torna-se ADMIN.
        // Todas as contas subsequentes são criadas como MEMBER por padrão.
        long existingUsersCount = userRepository.count();
        Role initialRole = (existingUsersCount == 0) ? Role.ADMIN : Role.MEMBER;

        // Gera código de verificação de 6 dígitos
        String code = String.format("%06d", new Random().nextInt(999999));

        // Calcula grupo etário se data de nascimento foi informada
        String ageGroup = "Não confirmado";
        if (request.getBirthDate() != null) {
            int age = Period.between(request.getBirthDate(), LocalDate.now()).getYears();
            ageGroup = (age >= 18) ? "18+" : (age >= 13 ? "13-17" : "Menor de 13");
        }

        User user = User.builder()
                .username(request.getUsername())
                .email(request.getEmail())
                .password(request.getPassword())
                .phone(request.getPhone())
                .birthDate(request.getBirthDate())
                .ageGroup(ageGroup)
                .avatarUrl(request.getAvatarUrl())
                .status(PresenceStatus.ONLINE)
                .role(initialRole)
                .emailVerified(false)
                .verificationCode(code)
                .build();

        User saved = userRepository.save(user);

        // Envia o e-mail real com o template do ChatterHub
        emailService.sendVerificationCode(saved.getEmail(), saved.getUsername(), code);

        return toDTO(saved);
    }

    @Transactional
    public UserDTO verifyEmail(VerifyEmailRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Conta não encontrada com este e-mail."));

        if (user.getVerificationCode() == null || !user.getVerificationCode().equals(request.getCode().trim())) {
            throw new RuntimeException("Código de verificação incorreto.");
        }

        user.setEmailVerified(true);
        user.setVerificationCode(null);
        return toDTO(userRepository.save(user));
    }

    public UserDTO login(LoginRequest request) {
        String idOrEmail = request.getUsernameOrEmail().trim();
        User user = userRepository.findByUsername(idOrEmail)
                .or(() -> userRepository.findByEmail(idOrEmail))
                .orElseThrow(() -> new RuntimeException("Credenciais inválidas. Usuário ou e-mail não encontrado."));

        if (!user.getPassword().equals(request.getPassword().trim())) {
            throw new RuntimeException("Senha incorreta.");
        }

        if (!user.isEmailVerified()) {
            throw new RuntimeException("E-mail não verificado. Digite o código de confirmação enviado para seu e-mail.");
        }

        return toDTO(user);
    }

    @Transactional
    public UserDTO updateProfile(String id, UpdateUserProfileRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado: " + id));

        if (request.getUsername() != null && !request.getUsername().isBlank() && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new RuntimeException("Nome de usuário já está em uso.");
            }
            user.setUsername(request.getUsername());
            user.setAvatarUrl("https://api.dicebear.com/7.x/thumbs/svg?seed=" + request.getUsername() + "&backgroundColor=5865f2");
        }

        if (request.getEmail() != null && !request.getEmail().isBlank() && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new RuntimeException("Email já está em uso.");
            }
            user.setEmail(request.getEmail());
        }

        if (request.getPhone() != null && !request.getPhone().isBlank()) {
            user.setPhone(request.getPhone());
        }

        if (request.getBirthDate() != null) {
            user.setBirthDate(request.getBirthDate());
            int age = Period.between(request.getBirthDate(), LocalDate.now()).getYears();
            user.setAgeGroup((age >= 18) ? "18+" : (age >= 13 ? "13-17" : "Menor de 13"));
        }

        if (request.getAvatarUrl() != null && !request.getAvatarUrl().isBlank()) {
            user.setAvatarUrl(request.getAvatarUrl());
        }

        if (request.getNewPassword() != null && !request.getNewPassword().isBlank()) {
            if (request.getCurrentPassword() != null && !request.getCurrentPassword().equals(user.getPassword())) {
                throw new RuntimeException("Senha atual incorreta.");
            }
            user.setPassword(request.getNewPassword());
        }

        return toDTO(userRepository.save(user));
    }

    @Transactional
    public UserDTO updateStatus(String id, PresenceStatus status) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado: " + id));
        user.setStatus(status);
        return toDTO(userRepository.save(user));
    }

    @Transactional
    public UserDTO updateRole(String id, UpdateUserRoleRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado: " + id));
        user.setRole(request.getRole());
        return toDTO(userRepository.save(user));
    }

    @Transactional
    public void deleteUser(String id) {
        if (!userRepository.existsById(id)) {
            throw new RuntimeException("Usuário não encontrado: " + id);
        }
        userRepository.deleteById(id);
    }

    public UserDTO toDTO(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .phone(user.getPhone())
                .ageGroup(user.getAgeGroup() != null ? user.getAgeGroup() : "Não confirmado")
                .birthDate(user.getBirthDate())
                .avatarUrl(user.getAvatarUrl())
                .status(user.getStatus())
                .role(user.getRole() != null ? user.getRole() : Role.MEMBER)
                .emailVerified(user.isEmailVerified())
                .isMuted(user.isMuted())
                .isDeafened(user.isDeafened())
                .build();
    }
}