import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { LucideAngularModule } from "lucide-angular";
import { UserService } from "../../services/user.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: "./login.component.html",
})
export class LoginComponent {
  mode = signal<"login" | "register">("login");
  step = signal<"form" | "verify">("form");

  loading = signal(false);
  error = signal("");

  loginForm = {
    usernameOrEmail: "",
    password: "",
  };

  registerForm = {
    username: "",
    email: "",
    phone: "",
    birthDate: "",
    password: "",
  };

  pendingEmail = "";
  verificationCode = "";

  constructor(private readonly userService: UserService) {}

  setMode(m: "login" | "register"): void {
    this.mode.set(m);
    this.step.set("form");
    this.error.set("");
  }

  async login(): Promise<void> {
    if (!this.loginForm.usernameOrEmail.trim() || !this.loginForm.password.trim()) {
      this.error.set("Preencha usuário/e-mail e senha.");
      return;
    }

    this.loading.set(true);
    this.error.set("");

    try {
      await this.userService.login(this.loginForm.usernameOrEmail, this.loginForm.password);
    } catch (err: any) {
      if (err.includes("não verificado")) {
        this.pendingEmail = this.loginForm.usernameOrEmail;
        this.step.set("verify");
      }
      this.error.set(err.toString());
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    if (!this.registerForm.username.trim() || !this.registerForm.email.trim() || !this.registerForm.password.trim()) {
      this.error.set("Preencha todos os campos obrigatórios (*).");
      return;
    }

    this.loading.set(true);
    this.error.set("");

    try {
      await this.userService.register({
        username: this.registerForm.username.trim(),
        email: this.registerForm.email.trim(),
        phone: this.registerForm.phone.trim() || undefined,
        birthDate: this.registerForm.birthDate || undefined,
        password: this.registerForm.password.trim(),
      });

      this.pendingEmail = this.registerForm.email.trim();
      this.step.set("verify");
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.loading.set(false);
    }
  }

  async verifyEmailCode(): Promise<void> {
    if (!this.verificationCode.trim()) {
      this.error.set("Digite o código de verificação recebido no seu e-mail.");
      return;
    }

    this.loading.set(true);
    this.error.set("");

    try {
      await this.userService.verifyEmail(this.pendingEmail, this.verificationCode.trim());
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.loading.set(false);
    }
  }
}