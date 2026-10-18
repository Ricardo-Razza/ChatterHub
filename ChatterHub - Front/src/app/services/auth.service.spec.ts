import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('deve inicializar como deslogado quando não há sessão salva', () => {
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.token()).toBe('');
  });

  it('deve realizar login com sucesso e armazenar token e usuário', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      avatarUrl: 'https://avatar.url',
      status: 'ONLINE',
      role: 'MEMBER',
    };
    const mockResponse = {
      token: 'jwt-fake-token-123',
      user: mockUser,
    };

    const loginPromise = service.login('testuser', 'password123', false);

    const req = httpMock.expectOne(`${environment.apiUrl}/users/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'testuser', password: 'password123' });
    req.flush(mockResponse);

    const loggedUser = await loginPromise;
    expect(loggedUser.username).toBe('testuser');
    expect(service.isLoggedIn()).toBeTrue();
    expect(service.getToken()).toBe('jwt-fake-token-123');
    expect(sessionStorage.getItem('ch_token')).toBe('jwt-fake-token-123');
  });

  it('deve cadastrar com apenas username e senha sem requerer e-mail', async () => {
    const mockUser = {
      id: 'user-2',
      username: 'novousuario',
      status: 'ONLINE',
      role: 'MEMBER',
    };
    const mockResponse = {
      token: 'jwt-token-registered',
      user: mockUser,
    };

    const regPromise = service.register('novousuario', 'senhaforte123');

    const req = httpMock.expectOne(`${environment.apiUrl}/users/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'novousuario', password: 'senhaforte123' });
    req.flush(mockResponse);

    const registeredUser = await regPromise;
    expect(registeredUser.username).toBe('novousuario');
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('deve limpar dados da sessão ao fazer logout', () => {
    sessionStorage.setItem('ch_token', 'token');
    localStorage.setItem('ch_token', 'token');

    // Spy reload to prevent actual reload during test
    spyOn(window.location, 'reload').and.stub();

    service.logout();

    expect(sessionStorage.getItem('ch_token')).toBeNull();
    expect(localStorage.getItem('ch_token')).toBeNull();
    expect(service.token()).toBe('');
  });

  it('deve mapear corretamente o usuário com mapUser', () => {
    const raw = {
      id: 'uuid-1',
      username: 'carlos',
      status: 'DND',
      role: 'ADMIN',
      muted: true,
      deafened: false,
    };

    const mapped = AuthService.mapUser(raw);
    expect(mapped.id).toBe('uuid-1');
    expect(mapped.username).toBe('carlos');
    expect(mapped.status).toBe('dnd');
    expect(mapped.role).toBe('ADMIN');
    expect(mapped.isMuted).toBeTrue();
  });
});
