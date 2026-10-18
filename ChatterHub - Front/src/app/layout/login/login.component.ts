import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  mode = signal<'login' | 'register'>('login');

  loading = signal(false);
  error = signal('');

  loginForm = {
    username: '',
    password: '',
    remember: false,
  };

  registerForm = {
    username: '',
    password: '',
    confirmPassword: '',
  };

  constructor(private readonly authService: AuthService) {}

  setMode(m: 'login' | 'register'): void {
    this.mode.set(m);
    this.error.set('');
  }

  async login(): Promise<void> {
    const { username, password, remember } = this.loginForm;
    if (!username.trim() || !password.trim()) {
      this.error.set('Preencha o usuário e a senha.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.login(username.trim(), password, remember);
    } catch (err: any) {
      this.error.set(err?.toString() ?? 'Usuário ou senha inválidos.');
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    const { username, password, confirmPassword } = this.registerForm;

    if (!username.trim() || !password.trim()) {
      this.error.set('Preencha o nome de usuário e a senha.');
      return;
    }
    if (username.trim().length < 3) {
      this.error.set('O nome de usuário deve ter pelo menos 3 caracteres.');
      return;
    }
    if (password.length < 8) {
      this.error.set('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      this.error.set('As senhas não coincidem.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.register(username.trim(), password);
    } catch (err: any) {
      this.error.set(err?.toString() ?? 'Erro ao criar conta.');
    } finally {
      this.loading.set(false);
    }
  }
}