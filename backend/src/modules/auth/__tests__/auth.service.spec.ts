import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole } from '@/common/enums/user-role.enum';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

const mockUser = (overrides = {}): Partial<User> => ({
  id: 'user-uuid-123',
  email: 'test@firma.com',
  fullName: 'Test User',
  role: UserRole.INSPECTOR,
  isActive: true,
  mfaEnabled: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  passwordHash: '$2b$12$hashedpassword',
  refreshTokenHash: null,
  isLocked: false,
  validatePassword: jest.fn().mockResolvedValue(true),
  validateRefreshToken: jest.fn().mockResolvedValue(true),
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
  setPassword: jest.fn().mockResolvedValue(undefined),
  ...overrides,
} as any);

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<Repository<User>>;
  let jwtService: jest.Mocked<JwtService>;
  let auditService: jest.Mocked<AuditService>;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, any> = {
                'jwt.secret':        'test-secret',
                'jwt.expiresIn':     '15m',
                'FRONTEND_URL':      'http://localhost:3001',
                'MFA_APP_NAME':      'PerKont',
                'MFA_ISSUER':        'PerKont',
              };
              return config[key];
            }),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationsService,
          useValue: { sendEmail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: 'winston',
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
    auditService = module.get(AuditService);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateUser ─────────────────────────────────────────────────────────
  describe('validateUser', () => {
    it('geçerli credentials ile user döndürmeli', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user as User);
      (user.validatePassword as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@firma.com', 'correctPassword');
      expect(result).toBe(user);
    });

    it('yanlış şifre ile null döndürmeli', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user as User);
      (user.validatePassword as jest.Mock).mockResolvedValue(false);
      userRepo.save.mockResolvedValue(user as User);

      const result = await service.validateUser('test@firma.com', 'wrongPassword');
      expect(result).toBeNull();
    });

    it('pasif kullanıcı ile null döndürmeli', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ isActive: false }) as User);
      const result = await service.validateUser('test@firma.com', 'password');
      expect(result).toBeNull();
    });

    it('kilitli hesap ile UnauthorizedException fırlatmalı', async () => {
      const lockedUser = mockUser({
        lockedUntil: new Date(Date.now() + 999999),
        get isLocked() { return true; },
      });
      userRepo.findOne.mockResolvedValue(lockedUser as User);

      await expect(service.validateUser('test@firma.com', 'password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('5 hatalı denemeden sonra hesabı kilitlemeli', async () => {
      const user = mockUser({ failedLoginAttempts: 4 });
      userRepo.findOne.mockResolvedValue(user as User);
      (user.validatePassword as jest.Mock).mockResolvedValue(false);
      userRepo.save.mockResolvedValue(user as User);

      await service.validateUser('test@firma.com', 'wrongPassword');

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lockedUntil: expect.any(Date) }),
      );
      expect(notificationsService.sendEmail).toHaveBeenCalled();
    });
  });

  // ─── generateTokens ───────────────────────────────────────────────────────
  describe('generateTokens', () => {
    it('accessToken ve refreshToken döndürmeli', async () => {
      const user = mockUser();
      userRepo.save.mockResolvedValue(user as User);

      const result = await service.generateTokens(user as User);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeTruthy();
      expect(result.requiresMfa).toBe(false);
      expect(result.user?.id).toBe(user.id);
    });

    it('audit log kaydı oluşturmalı', async () => {
      const user = mockUser();
      userRepo.save.mockResolvedValue(user as User);
      await service.generateTokens(user as User);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_LOGIN' }),
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('refreshToken sıfırlamalı', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 } as any);
      await service.logout('user-uuid-123');
      expect(userRepo.update).toHaveBeenCalledWith(
        'user-uuid-123',
        { refreshTokenHash: null, refreshTokenExpiresAt: null },
      );
    });

    it('audit log kaydı oluşturmalı', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 } as any);
      await service.logout('user-uuid-123');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_LOGOUT' }),
      );
    });
  });

  // ─── forgotPassword ───────────────────────────────────────────────────────
  describe('forgotPassword', () => {
    it('var olmayan email için sessizce geçmeli (güvenlik)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.forgotPassword({ email: 'nouser@firma.com' }))
        .resolves.not.toThrow();
      expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    });

    it('geçerli email için reset e-postası göndermeli', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user as User);
      userRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.forgotPassword({ email: 'test@firma.com' });
      expect(notificationsService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'password-reset', to: 'test@firma.com' }),
      );
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────
  describe('changePassword', () => {
    it('yanlış mevcut şifreyle UnauthorizedException fırlatmalı', async () => {
      const user = mockUser();
      (user.validatePassword as jest.Mock).mockResolvedValue(false);
      userRepo.findOneOrFail.mockResolvedValue(user as User);

      await expect(
        service.changePassword('user-uuid-123', {
          currentPassword: 'wrong',
          newPassword: 'NewPass123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('geçerli şifreyle başarıyla değiştirmeli', async () => {
      const user = mockUser();
      (user.validatePassword as jest.Mock).mockResolvedValue(true);
      userRepo.findOneOrFail.mockResolvedValue(user as User);
      userRepo.save.mockResolvedValue(user as User);

      await service.changePassword('user-uuid-123', {
        currentPassword: 'currentPass',
        newPassword: 'NewPass123!',
      });

      expect(user.setPassword).toHaveBeenCalledWith('NewPass123!');
      expect(notificationsService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'password-changed' }),
      );
    });
  });
});
